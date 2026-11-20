SET LOCAL search_path=pedpsy,pg_catalog;
-- 106: repeat delivery replaces the one-time code of an existing application. The
-- application, study and group stay the same; only the stored code hash and the
-- queued letter are refreshed. One request per minute; unknown mailbox learns nothing.
CREATE FUNCTION registration_resend_target(digest text,email text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE x record;target uuid;
BEGIN
  IF digest IS NULL OR email IS NULL OR length(btrim(email)) NOT BETWEEN 3 AND 320 THEN RETURN NULL;END IF;
  SELECT * INTO x FROM pedpsy.lock_registration_invite(digest);
  IF x.invitation_id IS NULL THEN RETURN NULL;END IF;
  SELECT o.id INTO target FROM pedpsy.registration_pending p JOIN pedpsy.contact_confirmation_outbox o ON o.pending_id=p.id
    WHERE p.invitation_id=x.invitation_id AND p.email_key=lower(btrim(email)) AND p.status='pending'
    ORDER BY p.created_at_ms DESC LIMIT 1;
  RETURN target;
END $$;
CREATE FUNCTION reserve_registration_resend(digest text,email text,delivery_id uuid,new_hash text,new_envelope text,now_ms bigint DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE x record;p record;o record;at bigint;
BEGIN
  IF digest IS NULL OR email IS NULL OR length(btrim(email)) NOT BETWEEN 3 AND 320 OR delivery_id IS NULL
    OR new_hash !~ '^sha256:[a-f0-9]{64}$' OR new_envelope IS NULL THEN
    RAISE EXCEPTION 'INVALID_REGISTRATION_INPUT' USING ERRCODE='22023';
  END IF;
  PERFORM pg_advisory_xact_lock(5151980006);
  SELECT * INTO x FROM pedpsy.lock_registration_invite(digest);
  IF x.invitation_id IS NULL THEN RETURN 'none';END IF;
  at:=coalesce(now_ms,floor(extract(epoch FROM clock_timestamp())*1000)::bigint);
  IF NOT EXISTS(SELECT 1 FROM pedpsy.group_invitations i WHERE i.id=x.invitation_id AND i.status='active' AND i.expires_at_ms>at) THEN RETURN 'none';END IF;
  SELECT * INTO p FROM pedpsy.registration_pending q
    WHERE q.invitation_id=x.invitation_id AND q.email_key=lower(btrim(email)) AND q.status='pending'
    ORDER BY q.created_at_ms DESC LIMIT 1 FOR UPDATE;
  IF p.id IS NULL OR p.expires_at_ms<=at THEN RETURN 'none';END IF;
  SELECT * INTO o FROM pedpsy.contact_confirmation_outbox q WHERE q.pending_id=p.id FOR UPDATE;
  IF o.id IS NULL OR o.id<>delivery_id THEN RETURN 'none';END IF;
  IF o.created_at_ms>at-60000 THEN RETURN 'throttled';END IF;
  UPDATE pedpsy.registration_pending SET confirmation_hash=new_hash WHERE id=p.id;
  UPDATE pedpsy.contact_confirmation_outbox SET token_envelope=new_envelope,created_at_ms=at,expires_at_ms=p.expires_at_ms,
    attempts=0,next_attempt_at_ms=at,status='ready' WHERE id=o.id;
  RETURN 'ok';
END $$;
REVOKE ALL ON FUNCTION registration_resend_target(text,text),reserve_registration_resend(text,text,uuid,text,text,bigint) FROM PUBLIC;
