SET LOCAL search_path=pedpsy,pg_catalog;
-- 122: bounded response read for the participant hot path.
--
-- The historical read selected pedpsy.responses by attempt_id and paid the
-- row-level policy can_read_attempt(attempt_id) on every returned row. That
-- policy performs an ownership join plus session_actor(), which was measured at
-- 0.5-0.8 s per save under 300 concurrent participants. This function performs
-- the same authorization once, then reads only the rows of that attempt. The
-- row-level policies on responses remain enabled and unchanged for every other
-- caller; this is an additional guarded read path.

CREATE FUNCTION own_attempt_responses(target uuid) RETURNS TABLE(item_id text,value text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE actor record;
BEGIN
  SELECT * INTO actor FROM pedpsy.session_actor();
  IF NOT FOUND OR actor.actor_role<>'participant' THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE='28000';
  END IF;
  -- Same visibility as the row-level policy: a non-readable attempt yields no
  -- rows instead of leaking existence or bypassing the active-scope rules.
  IF target IS NULL OR NOT pedpsy.can_read_attempt(target) THEN
    RETURN;
  END IF;
  RETURN QUERY
    SELECT r.item_id,r.value
      FROM pedpsy.responses r
     WHERE r.attempt_id=target AND r.study_id=actor.study_id
     ORDER BY r.item_id;
END $$;

REVOKE ALL ON FUNCTION own_attempt_responses(uuid) FROM PUBLIC;
