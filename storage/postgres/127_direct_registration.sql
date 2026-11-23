SET LOCAL search_path=pedpsy,pg_catalog;
-- 127: direct registration by a valid group invitation. Possession of the
-- invitation plus the participant's chosen password creates the account in one
-- transaction; no e-mail confirmation code is issued for registration. The code
-- remains the proof only for password reset. Existing contacts are never
-- reactivated or moved to another study.
CREATE FUNCTION complete_registration_direct(target uuid,browser text,new_scheme text,new_salt text,new_password_hash text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE x record;p record;contact record;at_ms bigint;participant uuid;credential uuid;code text;hint text;
BEGIN
  IF target IS NULL OR browser IS NULL OR browser !~ '^sha256:[a-f0-9]{64}$'
    OR new_scheme IS NULL OR new_scheme !~ '^[A-Za-z0-9._-]{1,80}$'
    OR new_salt IS NULL OR new_salt !~ '^[a-f0-9]{32}$'
    OR new_password_hash IS NULL OR new_password_hash !~ '^[a-f0-9]{128}$'
    THEN RAISE EXCEPTION 'INVALID_REGISTRATION_INPUT' USING ERRCODE='22023';END IF;
  PERFORM pg_advisory_xact_lock(5151980006);
  SELECT q.invitation_id INTO p FROM pedpsy.registration_pending q WHERE q.id=target;
  IF p.invitation_id IS NULL THEN RAISE EXCEPTION 'NOT_AVAILABLE' USING ERRCODE='P0002';END IF;
  SELECT i.token_hash INTO hint FROM pedpsy.group_invitations i WHERE i.id=p.invitation_id;
  SELECT * INTO x FROM pedpsy.lock_registration_invite(hint);
  SELECT * INTO p FROM pedpsy.registration_pending q WHERE q.id=target FOR UPDATE;
  at_ms:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
  IF p.id IS NULL OR p.status<>'reserved' OR p.browser_hash IS DISTINCT FROM browser OR at_ms>=p.expires_at_ms
    OR NOT EXISTS(SELECT 1 FROM pedpsy.group_invitations i WHERE i.id=x.invitation_id AND i.expires_at_ms>at_ms)
    OR (p.study_id,p.group_id,p.invitation_id,p.invitation_revision) IS DISTINCT FROM (x.study_id,x.group_id,x.invitation_id,x.invitation_revision)
    THEN RAISE EXCEPTION 'NOT_AVAILABLE' USING ERRCODE='P0002';END IF;
  IF p.contact_notice_version IS DISTINCT FROM x.notice_version THEN RAISE EXCEPTION 'PARTICIPATION_REQUIREMENTS_CHANGED' USING ERRCODE='P0001';END IF;
  SELECT * INTO contact FROM pedpsy.participant_contacts q WHERE q.study_id=x.study_id AND q.email_key=p.email_key FOR UPDATE;
  IF contact.id IS NOT NULL THEN RAISE EXCEPTION 'EMAIL_ALREADY_REGISTERED' USING ERRCODE='P0001';END IF;
  participant:=gen_random_uuid();credential:=gen_random_uuid();code:='P-'||upper(replace(participant::text,'-',''));
  INSERT INTO pedpsy.participants(id,study_id,display_code) VALUES(participant,x.study_id,code);
  INSERT INTO pedpsy.participant_group_bindings(study_id,participant_id,group_id,created_at_ms) VALUES(x.study_id,participant,x.group_id,at_ms);
  INSERT INTO pedpsy.participant_credentials(id,study_id,participant_id,login_id,scheme,salt,password_hash)
    VALUES(credential,x.study_id,participant,code,new_scheme,new_salt,new_password_hash);
  INSERT INTO pedpsy.participant_contacts(id,study_id,participant_id,email_key,source_pending_id,confirmed_at_ms)
    VALUES(gen_random_uuid(),x.study_id,participant,p.email_key,p.id,at_ms) RETURNING * INTO contact;
  INSERT INTO pedpsy.participant_contact_acceptances(pending_id,study_id,contact_id,notice_version,confirmed_at_ms)
    VALUES(p.id,x.study_id,contact.id,p.contact_notice_version,at_ms);
  UPDATE pedpsy.registration_pending SET status='confirmed',ready_at_ms=at_ms,confirmed_at_ms=at_ms,
    scheme=new_scheme,salt=new_salt,password_hash=new_password_hash,
    confirmation_hash='sha256:'||encode(sha256(convert_to('direct:'||p.id::text,'UTF8')),'hex') WHERE id=p.id;
  PERFORM pedpsy.registration_audit('participants.registration.direct',x.study_id,p.id,true);
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION complete_registration_direct(uuid,text,text,text,text) FROM PUBLIC;

-- The original guard only allowed reserved -> pending (then pending -> confirmed).
-- Direct registration commits a fully materialized reserved row straight to
-- confirmed; all frozen scope columns stay unchanged and the transition is
-- accepted only with the complete password material.
CREATE OR REPLACE FUNCTION guard_registration_pending() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,pedpsy AS $$
BEGIN
  IF TG_OP='DELETE' OR (NEW.id,NEW.study_id,NEW.group_id,NEW.invitation_id,NEW.invitation_revision,NEW.browser_hash,NEW.email_key,NEW.contact_notice_version,NEW.created_at_ms)
    IS DISTINCT FROM (OLD.id,OLD.study_id,OLD.group_id,OLD.invitation_id,OLD.invitation_revision,OLD.browser_hash,OLD.email_key,OLD.contact_notice_version,OLD.created_at_ms)
    THEN RAISE EXCEPTION 'registration scope frozen' USING ERRCODE='23514';END IF;
  IF OLD.status='reserved' AND NEW.status='pending' AND NEW.attempts_remaining=OLD.attempts_remaining THEN RETURN NEW;END IF;
  IF OLD.status='reserved' AND NEW.status='confirmed' AND NEW.attempts_remaining=OLD.attempts_remaining
    AND NEW.scheme IS NOT NULL AND NEW.salt IS NOT NULL AND NEW.password_hash IS NOT NULL
    AND NEW.confirmation_hash IS NOT NULL AND NEW.ready_at_ms IS NOT NULL AND NEW.confirmed_at_ms IS NOT NULL
    THEN RETURN NEW;END IF;
  IF (NEW.scheme,NEW.salt,NEW.password_hash,NEW.confirmation_hash,NEW.ready_at_ms,NEW.expires_at_ms)
    IS NOT DISTINCT FROM (OLD.scheme,OLD.salt,OLD.password_hash,OLD.confirmation_hash,OLD.ready_at_ms,OLD.expires_at_ms) THEN
    IF OLD.status IN ('reserved','pending') AND NEW.status='cancelled' AND NEW.attempts_remaining=OLD.attempts_remaining THEN RETURN NEW;END IF;
    IF OLD.status='pending' AND NEW.status='confirmed' AND NEW.attempts_remaining=OLD.attempts_remaining THEN RETURN NEW;END IF;
    IF OLD.status='pending' AND NEW.status='pending' AND NEW.attempts_remaining=OLD.attempts_remaining-1 THEN RETURN NEW;END IF;
  END IF;
  RAISE EXCEPTION 'registration transition frozen' USING ERRCODE='23514';
END $$;

