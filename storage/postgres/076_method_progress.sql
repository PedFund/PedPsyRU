SET LOCAL search_path=pedpsy,pg_catalog;
-- 076: aggregate per-method completion for the researcher dashboard. Only
-- counts leave the database; answers, scores and personal data are not exposed.
CREATE FUNCTION research_method_progress(study uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE registered integer;completed_any integer;rows jsonb;
BEGIN
  PERFORM pedpsy.lock_research_workbench(study);
  SELECT count(DISTINCT b.participant_id)::integer INTO registered
  FROM pedpsy.participant_group_bindings b
  JOIN pedpsy.participants p ON (p.study_id,p.id)=(b.study_id,b.participant_id) AND p.status='active'
  JOIN pedpsy.participant_contacts c ON (c.study_id,c.participant_id)=(b.study_id,b.participant_id) AND c.status='active'
  WHERE b.study_id=study AND c.email_key ~ '@example[.]test$';
  SELECT count(DISTINCT en.participant_id)::integer INTO completed_any
  FROM pedpsy.attempts a
  JOIN pedpsy.assignments z ON (z.study_id,z.id)=(a.study_id,a.assignment_id) AND z.status='active'
  JOIN pedpsy.stage_enrollments en ON (en.study_id,en.id)=(a.study_id,a.enrollment_id) AND en.status='active'
  JOIN pedpsy.participants p ON (p.study_id,p.id)=(en.study_id,en.participant_id) AND p.status='active'
  JOIN pedpsy.participant_contacts c ON (c.study_id,c.participant_id)=(en.study_id,en.participant_id) AND c.status='active'
  WHERE a.study_id=study AND a.status='completed' AND c.email_key ~ '@example[.]test$';
  SELECT coalesce(jsonb_agg(jsonb_build_object('release_id',z.release_id,'method_id',r.method_id,'completed',coalesce(x.completed,0)) ORDER BY r.method_id),'[]'::jsonb) INTO rows
  FROM (SELECT DISTINCT release_id FROM pedpsy.assignments WHERE study_id=study AND status='active') z
  JOIN pedpsy.instrument_releases r ON r.id=z.release_id
  LEFT JOIN LATERAL (
    SELECT count(DISTINCT en.participant_id)::integer completed
    FROM pedpsy.attempts a
    JOIN pedpsy.assignments zz ON (zz.study_id,zz.id)=(a.study_id,a.assignment_id) AND zz.status='active' AND zz.release_id=z.release_id
    JOIN pedpsy.stage_enrollments en ON (en.study_id,en.id)=(a.study_id,a.enrollment_id) AND en.status='active'
    JOIN pedpsy.participants p ON (p.study_id,p.id)=(en.study_id,en.participant_id) AND p.status='active'
    JOIN pedpsy.participant_contacts c ON (c.study_id,c.participant_id)=(en.study_id,en.participant_id) AND c.status='active'
    WHERE a.study_id=study AND a.status='completed' AND c.email_key ~ '@example[.]test$'
  ) x ON true;
  PERFORM pedpsy.constructor_audit('studies.method_progress.read',study);
  RETURN jsonb_build_object('registered',registered,'completed_any',completed_any,'rows',rows);
END $$;
REVOKE ALL ON FUNCTION research_method_progress(uuid) FROM PUBLIC;
