SET LOCAL search_path=pedpsy,pg_catalog;
-- 158: password reset by an e-mailed code without a group invitation.
--
-- The reset request used to be bound to the invitation token: the page had to
-- keep the group link and send it in x-pedpsy-invite. The participant client
-- clears that token after registration and after every sign-in, so on the page
-- that actually shows "Забыли пароль?" the header is gone and the request was
-- rejected with NOT_AVAILABLE before any code existed. The participant saw
-- "Доступ недоступен. Обратитесь к исследователю." and no letter was queued.
--
-- v3 tries the invitation study first (when a digest is supplied) and then the
-- single active study of the address, exactly like the login path resolves it.
-- A stale, foreign or revoked invitation therefore cannot block recovery. The
-- function still creates nothing but a short-lived code: no account, no
-- confirmed contact, no password change.

CREATE OR REPLACE FUNCTION pedpsy.create_password_reset_v3(invite_digest text, email text, code_hash text, ttl_ms bigint)
 RETURNS TABLE(study_id uuid, participant_id uuid, outcome text)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE x record;contact record;credential record;at bigint;normalized text;
  invite_study uuid;address_study uuid;ambiguous boolean:=false;candidate uuid;
BEGIN
  IF email IS NULL OR length(email) NOT BETWEEN 3 AND 320
    OR code_hash !~ '^sha256:[a-f0-9]{64}$' OR ttl_ms IS NULL OR ttl_ms NOT BETWEEN 60000 AND 86400000 THEN
    RAISE EXCEPTION 'INVALID_INPUT' USING ERRCODE='22023';
  END IF;
  normalized:=lower(btrim(email));
  IF invite_digest IS NOT NULL AND invite_digest ~ '^sha256:[a-f0-9]{64}$' THEN
    BEGIN
      SELECT * INTO x FROM pedpsy.lock_registration_invite(invite_digest);
      invite_study:=x.study_id;
    EXCEPTION WHEN SQLSTATE 'P0002' THEN
      invite_study:=NULL;
    END;
  END IF;
  BEGIN
    address_study:=pedpsy.participant_login_study(normalized);
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    ambiguous:=true;
  END;
  FOR candidate IN SELECT s FROM (VALUES (invite_study),(address_study)) v(s) WHERE s IS NOT NULL LOOP
    SELECT * INTO contact FROM pedpsy.participant_contacts c
      WHERE c.study_id=candidate AND c.email_key=normalized AND c.status='active';
    CONTINUE WHEN contact.id IS NULL;
    SELECT * INTO credential FROM pedpsy.participant_credentials c
      WHERE c.study_id=candidate AND c.participant_id=contact.participant_id AND c.status='active';
    IF credential.id IS NULL THEN
      RETURN QUERY SELECT candidate,contact.participant_id,'none'::text;RETURN;
    END IF;
    at:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
    UPDATE pedpsy.password_resets r SET status='cancelled'
      WHERE r.study_id=candidate AND r.participant_id=contact.participant_id AND r.status='pending';
    INSERT INTO pedpsy.password_resets(id,study_id,participant_id,code_hash,created_at_ms,expires_at_ms,attempts_remaining)
      VALUES(gen_random_uuid(),candidate,contact.participant_id,code_hash,at,at+ttl_ms,5);
    RETURN QUERY SELECT candidate,contact.participant_id,'ok'::text;RETURN;
  END LOOP;
  IF ambiguous THEN RETURN QUERY SELECT NULL::uuid,NULL::uuid,'ambiguous'::text;RETURN;END IF;
  RETURN QUERY SELECT NULL::uuid,NULL::uuid,'none'::text;
END $$;

CREATE OR REPLACE FUNCTION pedpsy.consume_password_reset_v3(invite_digest text, email text, code_hash text, new_scheme text, new_salt text, new_hash text)
 RETURNS text
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE x record;target record;at bigint;normalized text;invite_study uuid;address_study uuid;candidate uuid;
BEGIN
  IF email IS NULL OR length(email) NOT BETWEEN 3 AND 320 OR code_hash !~ '^sha256:[a-f0-9]{64}$'
    OR new_scheme IS NULL OR new_salt IS NULL OR new_hash IS NULL THEN RETURN 'none';END IF;
  normalized:=lower(btrim(email));
  IF invite_digest IS NOT NULL AND invite_digest ~ '^sha256:[a-f0-9]{64}$' THEN
    BEGIN
      SELECT * INTO x FROM pedpsy.lock_registration_invite(invite_digest);
      invite_study:=x.study_id;
    EXCEPTION WHEN SQLSTATE 'P0002' THEN
      invite_study:=NULL;
    END;
  END IF;
  BEGIN
    address_study:=pedpsy.participant_login_study(normalized);
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    address_study:=NULL;
  END;
  at:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
  FOR candidate IN SELECT s FROM (VALUES (invite_study),(address_study)) v(s) WHERE s IS NOT NULL LOOP
    SELECT r.* INTO target FROM pedpsy.password_resets r
      JOIN pedpsy.participant_contacts c ON (c.study_id,c.participant_id)=(r.study_id,r.participant_id)
      WHERE r.study_id=candidate AND c.email_key=normalized AND c.status='active'
        AND r.status='pending' AND r.expires_at_ms>at
      ORDER BY r.created_at_ms DESC LIMIT 1 FOR UPDATE;
    CONTINUE WHEN target.id IS NULL;
    IF target.code_hash<>code_hash THEN
      IF target.attempts_remaining<=1 THEN
        UPDATE pedpsy.password_resets SET status='cancelled' WHERE id=target.id;
      ELSE
        UPDATE pedpsy.password_resets SET attempts_remaining=attempts_remaining-1 WHERE id=target.id;
      END IF;
      RETURN 'none';
    END IF;
    UPDATE pedpsy.participant_credentials SET scheme=new_scheme,salt=new_salt,password_hash=new_hash,version=version+1
      WHERE study_id=candidate AND participant_id=target.participant_id AND status='active';
    IF NOT FOUND THEN RETURN 'none';END IF;
    UPDATE pedpsy.password_resets SET status='used',used_at_ms=at WHERE id=target.id;
    RETURN 'ok';
  END LOOP;
  RETURN 'none';
END $$;

-- Delivery outcome of the reset letter. Until now a failed SMTP send was
-- swallowed by the caller and left no trace at all.
CREATE OR REPLACE FUNCTION pedpsy.reset_email_audit(target_study uuid, delivered boolean)
 RETURNS void
 LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
  INSERT INTO pedpsy.access_audit_events(id,at_ms,study_id,action,outcome,reason)
    VALUES(gen_random_uuid(),floor(extract(epoch FROM clock_timestamp())*1000)::bigint,target_study,
      'participants.registration.reset_email',
      CASE WHEN delivered THEN 'allow' ELSE 'deny' END,
      CASE WHEN delivered THEN 'SENT' ELSE 'SMTP_FAILED' END)
$$;

REVOKE ALL ON FUNCTION pedpsy.create_password_reset_v3(text,text,text,bigint),pedpsy.consume_password_reset_v3(text,text,text,text,text,text),pedpsy.reset_email_audit(uuid,boolean) FROM PUBLIC;
