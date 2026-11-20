SET LOCAL search_path=pedpsy,pg_catalog;
-- 114: the participant chooses the password AFTER the e-mailed code is confirmed.
-- The confirmed code identifies the application, and an audit row makes the password
-- step single-use. Only an active contact is touched.
CREATE OR REPLACE FUNCTION complete_registration_password(digest text,confirmed_hash text,new_scheme text,new_salt text,new_password_hash text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE x record;p record;contact record;at bigint;
BEGIN
  IF digest IS NULL OR confirmed_hash !~ '^sha256:[a-f0-9]{64}$' OR new_scheme IS NULL OR new_salt IS NULL
    OR new_password_hash IS NULL THEN RAISE EXCEPTION 'INVALID_REGISTRATION_INPUT' USING ERRCODE='22023';END IF;
  PERFORM pg_advisory_xact_lock(5151980006);
  SELECT * INTO x FROM pedpsy.lock_registration_invite(digest);
  IF x.invitation_id IS NULL THEN RETURN 'none';END IF;
  at:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
  SELECT * INTO p FROM pedpsy.registration_pending q
    WHERE q.invitation_id=x.invitation_id AND q.confirmation_hash=confirmed_hash AND q.status='confirmed'
      AND q.confirmed_at_ms>at-1800000
    ORDER BY q.confirmed_at_ms DESC LIMIT 1 FOR UPDATE;
  IF p.id IS NULL THEN RETURN 'none';END IF;
  IF EXISTS(SELECT 1 FROM pedpsy.access_audit_events a WHERE a.action='participants.registration.password_set' AND a.resource_id=p.id) THEN RETURN 'none';END IF;
  SELECT * INTO contact FROM pedpsy.participant_contacts q WHERE q.study_id=p.study_id AND q.email_key=p.email_key FOR SHARE;
  IF contact.id IS NULL OR contact.status<>'active' THEN RETURN 'none';END IF;
  UPDATE pedpsy.participant_credentials SET scheme=new_scheme,salt=new_salt,password_hash=new_password_hash,version=version+1
    WHERE study_id=p.study_id AND participant_id=contact.participant_id AND status='active';
  IF NOT FOUND THEN RETURN 'none';END IF;
  PERFORM pedpsy.registration_audit('participants.registration.password_set',p.study_id,p.id,true);
  RETURN 'ok';
END $$;
REVOKE ALL ON FUNCTION complete_registration_password(text,text,text,text,text) FROM PUBLIC;
