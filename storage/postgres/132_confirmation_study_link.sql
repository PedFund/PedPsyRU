SET LOCAL search_path=pedpsy,pg_catalog;
-- 132: include the exact study in the confirmation claim so the e-mail can
-- link to that study instead of a generic platform page.
DROP FUNCTION claim_registration_confirmations(integer);
CREATE FUNCTION claim_registration_confirmations(batch_size integer)
RETURNS TABLE(id uuid,pending_id uuid,study_id uuid,recipient text,token_envelope text,expires_at_ms bigint,attempts integer,study_title text,group_name text)
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
  SELECT u.id,u.pending_id,p.study_id,u.recipient,u.token_envelope,u.expires_at_ms,u.attempts,s.title,g.name
  FROM updated u JOIN pedpsy.registration_pending p ON p.id=u.pending_id
  JOIN pedpsy.studies s ON s.id=p.study_id
  JOIN pedpsy.research_groups g ON g.study_id=p.study_id AND g.id=p.group_id;
END $$;
REVOKE ALL ON FUNCTION claim_registration_confirmations(integer) FROM PUBLIC;
