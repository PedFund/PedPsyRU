SET LOCAL search_path=pedpsy,pg_catalog;
-- 107: repeat delivery may rotate only the code of a live application and replace the
-- queued letter in place. Scope, password material and the attempt counter stay
-- byte-for-byte the same; no other transition becomes possible.
CREATE OR REPLACE FUNCTION guard_registration_pending() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,pedpsy AS $$
BEGIN
  IF TG_OP='DELETE' OR (NEW.id,NEW.study_id,NEW.group_id,NEW.invitation_id,NEW.invitation_revision,NEW.browser_hash,NEW.email_key,NEW.contact_notice_version,NEW.created_at_ms)
    IS DISTINCT FROM (OLD.id,OLD.study_id,OLD.group_id,OLD.invitation_id,OLD.invitation_revision,OLD.browser_hash,OLD.email_key,OLD.contact_notice_version,OLD.created_at_ms)
    THEN RAISE EXCEPTION 'registration scope frozen' USING ERRCODE='23514';END IF;
  IF OLD.status='reserved' AND NEW.status='pending' AND NEW.attempts_remaining=OLD.attempts_remaining THEN RETURN NEW;END IF;
  IF OLD.status='pending' AND NEW.status='pending' AND NEW.confirmation_hash IS DISTINCT FROM OLD.confirmation_hash
    AND (NEW.scheme,NEW.salt,NEW.password_hash,NEW.ready_at_ms,NEW.expires_at_ms,NEW.attempts_remaining)
      IS NOT DISTINCT FROM (OLD.scheme,OLD.salt,OLD.password_hash,OLD.ready_at_ms,OLD.expires_at_ms,OLD.attempts_remaining)
    THEN RETURN NEW;END IF;
  IF (NEW.scheme,NEW.salt,NEW.password_hash,NEW.confirmation_hash,NEW.ready_at_ms,NEW.expires_at_ms)
    IS NOT DISTINCT FROM (OLD.scheme,OLD.salt,OLD.password_hash,OLD.confirmation_hash,OLD.ready_at_ms,OLD.expires_at_ms) THEN
    IF OLD.status IN ('reserved','pending') AND NEW.status='cancelled' AND NEW.attempts_remaining=OLD.attempts_remaining THEN RETURN NEW;END IF;
    IF OLD.status='pending' AND NEW.status='confirmed' AND NEW.attempts_remaining=OLD.attempts_remaining THEN RETURN NEW;END IF;
    IF OLD.status='pending' AND NEW.status='pending' AND NEW.attempts_remaining=OLD.attempts_remaining-1 THEN RETURN NEW;END IF;
  END IF;
  RAISE EXCEPTION 'registration transition frozen' USING ERRCODE='23514';
END $$;
CREATE OR REPLACE FUNCTION guard_contact_outbox() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,pedpsy AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'confirmation outbox identity frozen' USING ERRCODE='23514';END IF;
  IF OLD.status='ready' AND NEW.status='ready'
    AND (NEW.id,NEW.pending_id,NEW.purpose,NEW.recipient) IS NOT DISTINCT FROM (OLD.id,OLD.pending_id,OLD.purpose,OLD.recipient)
    AND NEW.token_envelope IS DISTINCT FROM OLD.token_envelope
    AND NEW.attempts=0 AND NEW.created_at_ms>=OLD.created_at_ms AND NEW.next_attempt_at_ms>=OLD.next_attempt_at_ms
    THEN RETURN NEW;END IF;
  IF (NEW.id,NEW.pending_id,NEW.purpose,NEW.recipient,NEW.token_envelope,NEW.created_at_ms,NEW.expires_at_ms)
    IS DISTINCT FROM (OLD.id,OLD.pending_id,OLD.purpose,OLD.recipient,OLD.token_envelope,OLD.created_at_ms,OLD.expires_at_ms)
    OR OLD.status<>'ready' OR NEW.attempts NOT BETWEEN OLD.attempts AND OLD.attempts+1 OR NEW.next_attempt_at_ms<OLD.next_attempt_at_ms
    THEN RAISE EXCEPTION 'confirmation outbox identity frozen' USING ERRCODE='23514';END IF;
  RETURN NEW;
END $$;
