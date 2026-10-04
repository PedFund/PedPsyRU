SET LOCAL search_path=pedpsy,pg_catalog;
-- Append-only synthetic identity. No enrollment, attempts, real mail or new
-- researcher/staff contact permissions. Existing 001--022 checksums unchanged.
ALTER TABLE registration_pending ADD CONSTRAINT registration_pending_study_id UNIQUE(study_id,id);
ALTER TABLE registration_pending ADD CONSTRAINT registration_pending_notice_identity UNIQUE(study_id,id,contact_notice_version);
CREATE TABLE participant_group_bindings (
  study_id uuid NOT NULL,participant_id uuid NOT NULL,group_id uuid NOT NULL,
  created_at_ms bigint NOT NULL CHECK(created_at_ms>=0),PRIMARY KEY(study_id,participant_id),
  FOREIGN KEY(study_id,participant_id) REFERENCES participants(study_id,id),
  FOREIGN KEY(study_id,group_id) REFERENCES research_groups(study_id,id)
);
CREATE INDEX participant_binding_group ON participant_group_bindings(study_id,group_id);
CREATE TRIGGER participant_binding_immutable BEFORE UPDATE OR DELETE ON participant_group_bindings FOR EACH ROW EXECUTE FUNCTION immutable_row();
CREATE TABLE participant_contacts (
  id uuid PRIMARY KEY,study_id uuid NOT NULL,participant_id uuid NOT NULL,
  email_key text NOT NULL CHECK(length(email_key) BETWEEN 14 AND 77 AND email_key ~ '^[A-Za-z0-9!#$%&''*+/=?^_`{|}~-]+([.][A-Za-z0-9!#$%&''*+/=?^_`{|}~-]+)*@example[.]test$'),
  source_pending_id uuid NOT NULL,confirmed_at_ms bigint NOT NULL CHECK(confirmed_at_ms>=0),
  status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','withdrawn')),
  UNIQUE(study_id,email_key),UNIQUE(study_id,participant_id),UNIQUE(study_id,id),
  FOREIGN KEY(study_id,participant_id) REFERENCES participant_group_bindings(study_id,participant_id),
  FOREIGN KEY(study_id,source_pending_id) REFERENCES registration_pending(study_id,id)
);
CREATE INDEX participant_contact_pending ON participant_contacts(study_id,source_pending_id);
CREATE FUNCTION guard_participant_contact() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,pedpsy AS $$
BEGIN
  IF TG_OP<>'DELETE' AND (NEW.id,NEW.study_id,NEW.participant_id,NEW.email_key,NEW.source_pending_id,NEW.confirmed_at_ms)
    IS NOT DISTINCT FROM (OLD.id,OLD.study_id,OLD.participant_id,OLD.email_key,OLD.source_pending_id,OLD.confirmed_at_ms)
    AND OLD.status='active' AND NEW.status='withdrawn' THEN RETURN NEW;END IF;
  RAISE EXCEPTION 'contact identity frozen' USING ERRCODE='23514';
END $$;
CREATE TRIGGER participant_contact_guard BEFORE UPDATE OR DELETE ON participant_contacts FOR EACH ROW EXECUTE FUNCTION guard_participant_contact();
-- An acknowledgement of contact processing only; NOT study participation or
-- secondary research consent. Reconfirmation never overwrites a credential.
CREATE TABLE participant_contact_acceptances (
  pending_id uuid PRIMARY KEY,study_id uuid NOT NULL,contact_id uuid NOT NULL,notice_version text NOT NULL REFERENCES contact_notices(version),
  confirmed_at_ms bigint NOT NULL CHECK(confirmed_at_ms>=0),
  FOREIGN KEY(study_id,contact_id) REFERENCES participant_contacts(study_id,id),
  FOREIGN KEY(study_id,pending_id,notice_version) REFERENCES registration_pending(study_id,id,contact_notice_version)
);
CREATE INDEX contact_acceptance_current ON participant_contact_acceptances(study_id,contact_id,notice_version);
CREATE INDEX contact_acceptance_pending ON participant_contact_acceptances(study_id,pending_id,notice_version);
CREATE INDEX contact_acceptance_notice ON participant_contact_acceptances(notice_version);
CREATE TRIGGER contact_acceptance_immutable BEFORE UPDATE OR DELETE ON participant_contact_acceptances FOR EACH ROW EXECUTE FUNCTION immutable_row();
ALTER TABLE participant_group_bindings ENABLE ROW LEVEL SECURITY;ALTER TABLE participant_contacts ENABLE ROW LEVEL SECURITY;ALTER TABLE participant_contact_acceptances ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON participant_group_bindings,participant_contacts,participant_contact_acceptances FROM PUBLIC;

CREATE FUNCTION confirm_registration_email(digest text,browser text,confirmation text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE x record;p record;contact record;at_ms bigint;participant uuid;credential uuid;code text;
BEGIN
  PERFORM pg_advisory_xact_lock(5151980006);SELECT * INTO x FROM pedpsy.lock_registration_invite(digest);
  IF browser IS NULL OR browser !~ '^sha256:[a-f0-9]{64}$' OR confirmation IS NULL OR confirmation !~ '^sha256:[a-f0-9]{64}$'
    OR browser=digest OR confirmation IN (browser,digest) THEN RAISE EXCEPTION 'INVALID_REGISTRATION_INPUT' USING ERRCODE='22023';END IF;
  -- Resolve only inside the current browser+invite scope. A replay/old token
  -- never consumes a newer registration's attempts. Invalid code consumes only
  -- the latest live request of this same browser, never another browser's row.
  SELECT * INTO p FROM pedpsy.registration_pending q WHERE q.invitation_id=x.invitation_id AND q.browser_hash=browser AND q.confirmation_hash=confirmation FOR UPDATE;
  IF NOT FOUND THEN
    SELECT * INTO p FROM pedpsy.registration_pending q WHERE q.invitation_id=x.invitation_id AND q.browser_hash=browser AND q.status='pending'
      ORDER BY q.ready_at_ms DESC,q.id LIMIT 1 FOR UPDATE;
  END IF;
  at_ms:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
  IF p.id IS NULL OR p.status<>'pending' OR p.expires_at_ms<=at_ms OR p.attempts_remaining=0
    OR NOT EXISTS(SELECT 1 FROM pedpsy.group_invitations i WHERE i.id=x.invitation_id AND i.expires_at_ms>at_ms)
    OR (p.study_id,p.group_id,p.invitation_revision) IS DISTINCT FROM (x.study_id,x.group_id,x.invitation_revision) THEN
    PERFORM pedpsy.registration_audit('participants.registration.confirm_denied',x.study_id,p.id,false);RETURN false;
  END IF;
  IF p.contact_notice_version IS DISTINCT FROM x.notice_version THEN RAISE EXCEPTION 'PARTICIPATION_REQUIREMENTS_CHANGED' USING ERRCODE='P0001';END IF;
  IF p.confirmation_hash IS DISTINCT FROM confirmation THEN
    UPDATE pedpsy.registration_pending SET attempts_remaining=attempts_remaining-1 WHERE id=p.id;
    IF p.attempts_remaining=1 THEN
      UPDATE pedpsy.registration_pending SET status='cancelled' WHERE id=p.id;
      UPDATE pedpsy.contact_confirmation_outbox SET status='cancelled' WHERE pending_id=p.id AND status='ready';
    END IF;
    PERFORM pedpsy.registration_audit('participants.registration.confirm_denied',x.study_id,p.id,false);RETURN false;
  END IF;
  SELECT * INTO contact FROM pedpsy.participant_contacts q WHERE q.study_id=x.study_id AND q.email_key=p.email_key FOR SHARE;
  IF contact.id IS NULL THEN
    participant:=gen_random_uuid();credential:=gen_random_uuid();code:='P-'||upper(replace(participant::text,'-',''));
    INSERT INTO pedpsy.participants(id,study_id,display_code) VALUES(participant,x.study_id,code);
    INSERT INTO pedpsy.participant_group_bindings(study_id,participant_id,group_id,created_at_ms) VALUES(x.study_id,participant,x.group_id,at_ms);
    INSERT INTO pedpsy.participant_credentials(id,study_id,participant_id,login_id,scheme,salt,password_hash)
      VALUES(credential,x.study_id,participant,code,p.scheme,p.salt,p.password_hash);
    INSERT INTO pedpsy.participant_contacts(id,study_id,participant_id,email_key,source_pending_id,confirmed_at_ms)
      VALUES(gen_random_uuid(),x.study_id,participant,p.email_key,p.id,at_ms) RETURNING * INTO contact;
  END IF;
  -- Existing contact (including withdrawn/excluded/revoked identity) is NEVER
  -- reactivated, moved, merged across studies, or assigned this new password.
  UPDATE pedpsy.registration_pending SET status='confirmed',confirmed_at_ms=at_ms WHERE id=p.id;
  INSERT INTO pedpsy.participant_contact_acceptances(pending_id,study_id,contact_id,notice_version,confirmed_at_ms)
    VALUES(p.id,x.study_id,contact.id,p.contact_notice_version,at_ms);
  UPDATE pedpsy.contact_confirmation_outbox SET status='cancelled' WHERE pending_id=p.id AND status='ready';
  PERFORM pedpsy.registration_audit('participants.registration.confirmed',x.study_id,p.id);RETURN true;
END $$;

CREATE FUNCTION participant_email_login_material(target_study uuid,email text)
RETURNS TABLE(throttled boolean,credential_id uuid,credential_version integer,salt text,password_hash text,contact_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE at_ms bigint:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;bucket text;window_ms bigint;limit_n integer;throttle record;c record;contact record;
BEGIN
  IF target_study IS NULL OR email IS NULL OR length(email) NOT BETWEEN 14 AND 77
    OR email !~ '^[A-Za-z0-9!#$%&''*+/=?^_`{|}~-]+([.][A-Za-z0-9!#$%&''*+/=?^_`{|}~-]+)*@example[.]test$' THEN RAISE EXCEPTION 'INVALID_REGISTRATION_INPUT' USING ERRCODE='22023';END IF;
  -- Same bounded admission lock/global bucket as existing participant code
  -- login. A known credential also shares its old per-code bucket; no bypass.
  PERFORM pg_advisory_xact_lock(5151980003);
  at_ms:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
  SELECT * INTO contact FROM pedpsy.participant_contacts q WHERE q.study_id=target_study AND q.email_key=email;
  SELECT * INTO c FROM pedpsy.participant_credentials q WHERE q.study_id=target_study AND q.participant_id=contact.participant_id;
  FOR bucket,window_ms,limit_n IN
    SELECT 'pedpsy-login:global',300000::bigint,30 UNION ALL
    SELECT 'pedpsy-email-login:'||target_study::text||':'||email,900000::bigint,5 UNION ALL
    SELECT 'pedpsy-login:'||c.login_id,900000::bigint,5 WHERE c.id IS NOT NULL LOOP
    bucket:='sha256:'||encode(sha256(convert_to(bucket,'UTF8')),'hex');
    SELECT * INTO throttle FROM pedpsy.login_throttles q WHERE q.bucket_hash=bucket FOR UPDATE;
    IF FOUND AND at_ms-throttle.window_start_ms<window_ms AND throttle.count>=limit_n THEN
      PERFORM pedpsy.registration_audit('participants.email_login.throttled',target_study,NULL,false);
      RETURN QUERY SELECT true,NULL::uuid,NULL::integer,NULL::text,NULL::text,NULL::uuid;RETURN;
    END IF;
    INSERT INTO pedpsy.login_throttles(bucket_hash,window_start_ms,count) VALUES(bucket,at_ms,1)
      ON CONFLICT(bucket_hash) DO UPDATE SET window_start_ms=CASE WHEN at_ms-login_throttles.window_start_ms>=window_ms THEN at_ms ELSE login_throttles.window_start_ms END,
      count=CASE WHEN at_ms-login_throttles.window_start_ms>=window_ms THEN 1 ELSE login_throttles.count+1 END;
  END LOOP;
  RETURN QUERY SELECT false,c.id,c.version,c.salt,c.password_hash,contact.id FROM pedpsy.studies s
    JOIN pedpsy.participants p ON p.study_id=s.id AND p.id=contact.participant_id
    JOIN pedpsy.participant_group_bindings b ON (b.study_id,b.participant_id)=(p.study_id,p.id)
    JOIN pedpsy.research_groups g ON (g.study_id,g.id)=(b.study_id,b.group_id)
    JOIN pedpsy.study_contact_policies policy ON policy.study_id=s.id JOIN pedpsy.contact_notices n ON n.version=policy.notice_version
    WHERE s.id=target_study AND s.status='active' AND s.dataset_kind='demo' AND p.status='active' AND g.status='active'
      AND c.id IS NOT NULL AND c.status='active' AND contact.status='active' AND n.legal_status='synthetic_only'
      AND EXISTS(SELECT 1 FROM pedpsy.participant_contact_acceptances a WHERE a.study_id=s.id AND a.contact_id=contact.id AND a.notice_version=n.version);
END $$;
CREATE FUNCTION finish_participant_email_login(credential uuid,expected_version integer,derived_hash text,target_contact uuid,session_hash text) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE c record;s record;p record;g record;b record;contact record;policy record;n record;
BEGIN
  SELECT * INTO c FROM pedpsy.participant_credentials q WHERE q.id=credential FOR UPDATE;
  SELECT * INTO s FROM pedpsy.studies q WHERE q.id=c.study_id FOR SHARE;
  SELECT * INTO b FROM pedpsy.participant_group_bindings q WHERE q.study_id=c.study_id AND q.participant_id=c.participant_id FOR SHARE;
  SELECT * INTO g FROM pedpsy.research_groups q WHERE q.study_id=c.study_id AND q.id=b.group_id FOR SHARE;
  SELECT * INTO policy FROM pedpsy.study_contact_policies q WHERE q.study_id=c.study_id FOR SHARE;
  SELECT * INTO n FROM pedpsy.contact_notices q WHERE q.version=policy.notice_version FOR SHARE;
  SELECT * INTO p FROM pedpsy.participants q WHERE q.study_id=c.study_id AND q.id=c.participant_id FOR SHARE;
  SELECT * INTO contact FROM pedpsy.participant_contacts q WHERE q.id=target_contact AND q.study_id=c.study_id AND q.participant_id=c.participant_id FOR SHARE;
  IF c.id IS NULL OR c.status<>'active' OR c.version IS DISTINCT FROM expected_version OR c.password_hash IS DISTINCT FROM derived_hash
    OR s.id IS NULL OR s.status<>'active' OR s.dataset_kind<>'demo' OR p.id IS NULL OR p.status<>'active' OR b.participant_id IS NULL
    OR g.id IS NULL OR g.status<>'active' OR contact.id IS NULL OR contact.status<>'active' OR n.version IS NULL OR n.legal_status<>'synthetic_only'
    OR NOT EXISTS(SELECT 1 FROM pedpsy.participant_contact_acceptances a WHERE a.study_id=s.id AND a.contact_id=contact.id AND a.notice_version=n.version) THEN
    PERFORM pedpsy.registration_audit('participants.email_login.denied',c.study_id,NULL,false);RETURN NULL;
  END IF;
  -- Reuses the established session rotation/expiry/required audit, after current
  -- contact/group/notice checks under locks; no hashing or mail in this SQL.
  RETURN pedpsy.finish_participant_login(c.id,c.version,c.password_hash,session_hash);
END $$;
REVOKE ALL ON FUNCTION guard_participant_contact(),confirm_registration_email(text,text,text),participant_email_login_material(uuid,text),finish_participant_email_login(uuid,integer,text,uuid,text) FROM PUBLIC;

-- Compatibility route is reserved for pre-existing code-based demo accounts.
-- A contact-linked credential must pass scoped email/current notice checks;
-- its internal display/login code is NOT an alternative auth route. Keep old
-- 004 migration bytes intact and preserve its shared throttle/audit behavior.
CREATE OR REPLACE FUNCTION participant_login_material(code text) RETURNS TABLE(throttled boolean,credential_id uuid,credential_version integer,salt text,password_hash text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE at bigint:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;bucket text;window_ms bigint;limit_n integer;state record;
BEGIN
  IF code IS NULL OR code !~ '^[A-Z0-9-]{3,80}$' THEN RAISE EXCEPTION 'INVALID_LOGIN' USING ERRCODE='28000';END IF;
  PERFORM pg_advisory_xact_lock(5151980003);
  FOR bucket,window_ms,limit_n IN SELECT 'global',300000::bigint,30 UNION ALL SELECT code,900000::bigint,5 LOOP
    bucket:='sha256:'||encode(sha256(convert_to('pedpsy-login:'||bucket,'UTF8')),'hex');
    SELECT * INTO state FROM pedpsy.login_throttles WHERE bucket_hash=bucket FOR UPDATE;
    IF FOUND AND at-state.window_start_ms<window_ms AND state.count>=limit_n THEN
      INSERT INTO pedpsy.access_audit_events(id,at_ms,action,outcome,reason) VALUES(gen_random_uuid(),at,'participant_login','deny','LOGIN_THROTTLED');
      RETURN QUERY SELECT true,NULL::uuid,NULL::integer,NULL::text,NULL::text;RETURN;
    END IF;
    INSERT INTO pedpsy.login_throttles(bucket_hash,window_start_ms,count) VALUES(bucket,at,1)
      ON CONFLICT(bucket_hash) DO UPDATE SET window_start_ms=CASE WHEN at-login_throttles.window_start_ms>=window_ms THEN at ELSE login_throttles.window_start_ms END,
      count=CASE WHEN at-login_throttles.window_start_ms>=window_ms THEN 1 ELSE login_throttles.count+1 END;
  END LOOP;
  RETURN QUERY SELECT false,c.id,c.version,c.salt,c.password_hash FROM pedpsy.participant_credentials c
    JOIN pedpsy.participants p ON (p.study_id,p.id)=(c.study_id,c.participant_id) JOIN pedpsy.studies s ON s.id=c.study_id
    WHERE c.login_id=code AND c.status='active' AND p.status='active' AND s.status='active' AND s.dataset_kind='demo'
      AND NOT EXISTS(SELECT 1 FROM pedpsy.participant_contacts contact WHERE contact.study_id=c.study_id AND contact.participant_id=c.participant_id);
END $$;
REVOKE ALL ON FUNCTION participant_login_material(text) FROM PUBLIC;
