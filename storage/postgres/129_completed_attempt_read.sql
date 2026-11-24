SET LOCAL search_path=pedpsy,pg_catalog;
-- 129: a participant must always be able to read their own completed attempt,
-- even after the stage/group/assignment is closed or admission requirements
-- changed. Live attempts keep the stricter active-admission rule.
CREATE OR REPLACE FUNCTION can_read_attempt(attempt uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
  SELECT pedpsy.owns_active_attempt(attempt)
    OR EXISTS(
      SELECT 1 FROM pedpsy.attempts a
      JOIN pedpsy.stage_enrollments e ON (e.study_id,e.id)=(a.study_id,a.enrollment_id)
      JOIN pedpsy.session_actor() s ON (s.study_id,s.participant_id)=(a.study_id,e.participant_id)
      WHERE a.id=attempt AND s.actor_role='participant' AND a.status='completed')
    OR EXISTS(SELECT 1 FROM pedpsy.session_actor() WHERE actor_role IN ('administrator','superadministrator'))
$$;
REVOKE ALL ON FUNCTION can_read_attempt(uuid) FROM PUBLIC;
