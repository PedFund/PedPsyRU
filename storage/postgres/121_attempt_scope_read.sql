SET LOCAL search_path=pedpsy,pg_catalog;
-- 121: bounded attempt listing for the participant session.
--
-- The historical participant session read selected every row of pedpsy.attempts
-- and relied on the row-level policy alone. The policy calls can_read_attempt(id)
-- per row, which performs an ownership join plus session_actor(). That made one
-- page load cost O(all attempts in the database) and was measured at 725 ms for
-- 1440 attempts.
--
-- This migration keeps the RLS policy and its per-row check unchanged. It adds
-- (a) the missing index for the owner lookup and (b) a guarded, SECURITY DEFINER
-- helper that returns only the caller's enrollment ids, so the application can
-- narrow the scan before RLS runs. No data is rewritten and no historical
-- migration is modified.

CREATE INDEX IF NOT EXISTS enrollments_participant ON stage_enrollments(study_id,participant_id);

CREATE FUNCTION own_enrollment_ids() RETURNS uuid[]
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE actor record; ids uuid[];
BEGIN
  SELECT * INTO actor FROM pedpsy.session_actor();
  IF NOT FOUND OR actor.actor_role<>'participant' THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE='28000';
  END IF;
  SELECT coalesce(array_agg(e.id ORDER BY e.id),'{}'::uuid[]) INTO ids
    FROM pedpsy.stage_enrollments e
   WHERE e.study_id=actor.study_id AND e.participant_id=actor.participant_id;
  RETURN ids;
END $$;

REVOKE ALL ON FUNCTION own_enrollment_ids() FROM PUBLIC;
