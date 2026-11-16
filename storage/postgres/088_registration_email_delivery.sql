SET LOCAL search_path=pedpsy,pg_catalog;
-- 088: durable delivery of registration confirmation codes. The outbox row
-- keeps the encrypted one-time code; only a bounded worker can claim it, send
-- the message outside the transaction and record a value-free audit event.
ALTER TABLE contact_confirmation_outbox DROP CONSTRAINT IF EXISTS contact_confirmation_outbox_status_check;
ALTER TABLE contact_confirmation_outbox ADD CONSTRAINT contact_confirmation_outbox_status_check
  CHECK(status IN ('ready','sent','failed','cancelled'));

CREATE FUNCTION claim_registration_confirmations(batch_size integer)
RETURNS TABLE(id uuid,pending_id uuid,recipient text,token_envelope text,expires_at_ms bigint,attempts integer,study_title text,group_name text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE at bigint;lease bigint;
BEGIN
  IF batch_size IS NULL OR batch_size<1 OR batch_size>50 THEN RAISE EXCEPTION 'INVALID_DELIVERY_BATCH' USING ERRCODE='22023';END IF;
  at:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;lease:=at+60000;
  RETURN QUERY
  WITH candidates AS (
    SELECT o.id FROM pedpsy.contact_confirmation_outbox o
    WHERE o.status='ready' AND o.attempts<10 AND o.next_attempt_at_ms<=at AND o.expires_at_ms>at
    ORDER BY o.next_attempt_at_ms,o.id LIMIT batch_size FOR UPDATE SKIP LOCKED
  ), updated AS (
    UPDATE pedpsy.contact_confirmation_outbox o SET attempts=o.attempts+1,next_attempt_at_ms=lease
    WHERE o.id IN (SELECT c.id FROM candidates c) RETURNING o.*
  )
  SELECT u.id,u.pending_id,u.recipient,u.token_envelope,u.expires_at_ms,u.attempts,s.title,g.name
  FROM updated u JOIN pedpsy.registration_pending p ON p.id=u.pending_id
  JOIN pedpsy.studies s ON s.id=p.study_id
  JOIN pedpsy.research_groups g ON g.study_id=p.study_id AND g.id=p.group_id;
END $$;

CREATE FUNCTION finish_registration_confirmation(target uuid,sent boolean,next_attempt_ms bigint,reason text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE o record;at bigint;state text;
BEGIN
  IF target IS NULL OR sent IS NULL OR reason IS NULL OR reason !~ '^[A-Z_]{3,64}$' THEN RAISE EXCEPTION 'INVALID_DELIVERY_RESULT' USING ERRCODE='22023';END IF;
  at:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
  SELECT * INTO o FROM pedpsy.contact_confirmation_outbox WHERE id=target FOR UPDATE;
  IF NOT FOUND THEN RETURN 'missing';END IF;
  IF o.status<>'ready' THEN RETURN o.status;END IF;
  IF sent THEN
    UPDATE pedpsy.contact_confirmation_outbox SET status='sent',sent_at_ms=at,next_attempt_at_ms=greatest(o.next_attempt_at_ms,at) WHERE id=target;
    state:='sent';
  ELSIF reason IN ('RECIPIENT_NOT_ALLOWED','INVALID_ENVELOPE','EXPIRED','MAX_ATTEMPTS') OR o.attempts>=10 OR at>=o.expires_at_ms THEN
    UPDATE pedpsy.contact_confirmation_outbox SET status='failed',next_attempt_at_ms=greatest(coalesce(next_attempt_ms,at),o.next_attempt_at_ms,at) WHERE id=target;
    state:='failed';
  ELSE
    UPDATE pedpsy.contact_confirmation_outbox SET next_attempt_at_ms=greatest(coalesce(next_attempt_ms,at+60000),o.next_attempt_at_ms) WHERE id=target;
    state:='ready';
  END IF;
  INSERT INTO pedpsy.access_audit_events(id,at_ms,action,outcome,reason,resource_id)
    VALUES(gen_random_uuid(),at,'participants.registration.email',CASE WHEN sent THEN 'allow' ELSE 'deny' END,reason,target);
  RETURN state;
END $$;

CREATE FUNCTION fail_stale_registration_confirmations() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE r record;at bigint;n integer:=0;
BEGIN
  at:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
  FOR r IN UPDATE pedpsy.contact_confirmation_outbox o SET status='failed',next_attempt_at_ms=greatest(o.next_attempt_at_ms,at)
    WHERE o.status='ready' AND (o.attempts>=10 OR o.expires_at_ms<=at)
    RETURNING o.id,o.attempts,o.expires_at_ms LOOP
    INSERT INTO pedpsy.access_audit_events(id,at_ms,action,outcome,reason,resource_id)
      VALUES(gen_random_uuid(),at,'participants.registration.email','deny',CASE WHEN r.attempts>=10 THEN 'MAX_ATTEMPTS' ELSE 'EXPIRED' END,r.id);
    n:=n+1;
  END LOOP;
  RETURN n;
END $$;

REVOKE ALL ON FUNCTION claim_registration_confirmations(integer),finish_registration_confirmation(uuid,boolean,bigint,text),fail_stale_registration_confirmations() FROM PUBLIC;
