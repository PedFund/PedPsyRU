SET LOCAL search_path=pedpsy,pg_catalog;
-- 156: restore can_read_attempt() to the definition migration 129 introduced.
-- The deployed database still had the older body: a participant could not read
-- their own completed attempt through this predicate, so results access depended
-- on a path the migrations say is allowed.
--
-- A full fingerprint of all 213 pedpsy functions and 47 triggers against a
-- database built from the migration chain found this as the only difference;
-- this migration closes it.
CREATE OR REPLACE FUNCTION pedpsy.can_read_attempt(attempt uuid) RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path=pg_catalog,pedpsy,pg_temp AS $$
  SELECT pedpsy.owns_active_attempt(attempt)
    OR EXISTS(
      SELECT 1 FROM pedpsy.attempts a
      JOIN pedpsy.stage_enrollments e ON (e.study_id,e.id)=(a.study_id,a.enrollment_id)
      JOIN pedpsy.session_actor() s ON (s.study_id,s.participant_id)=(a.study_id,e.participant_id)
      WHERE a.id=attempt AND s.actor_role='participant' AND a.status='completed')
    OR EXISTS(SELECT 1 FROM pedpsy.session_actor() WHERE actor_role IN ('administrator','superadministrator'))
$$;
REVOKE ALL ON FUNCTION pedpsy.can_read_attempt(uuid) FROM PUBLIC;
