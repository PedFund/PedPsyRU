SET LOCAL search_path=pedpsy,pg_catalog;
-- 089: a real-mail confirmation can be delivered hours after the request
-- (provider queues, spam checks). The old 30-minute pending/outbox TTL made
-- such a code unusable on arrival. Keep the reservation step short, but give
-- the queued confirmation a 24-hour lifetime. The schema cap is 25 hours from
-- reservation so queueing delay cannot violate the check; actual code expiry
-- is 24 hours from queue time.
ALTER TABLE registration_pending DROP CONSTRAINT registration_pending_check;
ALTER TABLE registration_pending ADD CONSTRAINT registration_pending_check
  CHECK(expires_at_ms>created_at_ms AND expires_at_ms<=created_at_ms+90000000);

CREATE FUNCTION queue_registration_confirmation_v2(target uuid,browser text,new_salt text,new_password_hash text,confirmation text,delivery uuid,envelope text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE hint record;x record;p record;at_ms bigint;
BEGIN
  PERFORM pg_advisory_xact_lock(5151980006);
  SELECT i.token_hash INTO hint FROM pedpsy.registration_pending q JOIN pedpsy.group_invitations i ON i.id=q.invitation_id WHERE q.id=target;
  SELECT * INTO x FROM pedpsy.lock_registration_invite(hint.token_hash);
  SELECT * INTO p FROM pedpsy.registration_pending q WHERE q.id=target FOR UPDATE;at_ms:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
  IF p.id IS NULL OR p.status<>'reserved' OR p.browser_hash IS DISTINCT FROM browser OR at_ms>=p.expires_at_ms
    OR (p.study_id,p.group_id,p.invitation_id,p.invitation_revision) IS DISTINCT FROM (x.study_id,x.group_id,x.invitation_id,x.invitation_revision)
    THEN RAISE EXCEPTION 'NOT_AVAILABLE' USING ERRCODE='P0002';END IF;
  IF p.contact_notice_version IS DISTINCT FROM x.notice_version THEN RAISE EXCEPTION 'PARTICIPATION_REQUIREMENTS_CHANGED' USING ERRCODE='P0001';END IF;
  IF new_salt IS NULL OR new_salt !~ '^[a-f0-9]{32}$' OR new_password_hash IS NULL OR new_password_hash !~ '^[a-f0-9]{128}$'
    OR confirmation IS NULL OR confirmation !~ '^sha256:[a-f0-9]{64}$' OR confirmation IN (browser,hint.token_hash)
    OR delivery IS NULL OR envelope IS NULL OR envelope !~ '^v1[.][A-Za-z0-9_-]{16}[.][A-Za-z0-9_-]{58}[.][A-Za-z0-9_-]{22}$'
    THEN RAISE EXCEPTION 'INVALID_REGISTRATION_INPUT' USING ERRCODE='22023';END IF;
  UPDATE pedpsy.registration_pending SET status='pending',ready_at_ms=at_ms,expires_at_ms=at_ms+86400000,
    scheme='scrypt-N131072-r8-p1-dk64',salt=new_salt,password_hash=new_password_hash,confirmation_hash=confirmation WHERE id=p.id;
  INSERT INTO pedpsy.contact_confirmation_outbox(id,pending_id,recipient,token_envelope,created_at_ms,expires_at_ms,next_attempt_at_ms)
    VALUES(delivery,p.id,p.email_key,envelope,at_ms,at_ms+86400000,at_ms);
  PERFORM pedpsy.registration_audit('participants.registration.requested',x.study_id,p.id);
END $$;

REVOKE ALL ON FUNCTION queue_registration_confirmation_v2(uuid,text,text,text,text,uuid,text) FROM PUBLIC;
