SET LOCAL search_path=pedpsy,pg_catalog;
-- 078: add completed-all and method version metadata for the researcher
-- analytics view. Levels and means remain aggregate-only.
CREATE OR REPLACE FUNCTION research_method_analytics(study uuid, group_filter uuid DEFAULT NULL, stage_filter uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE registered integer;completed_any integer;completed_all integer;rows jsonb;
BEGIN
  PERFORM pedpsy.lock_research_workbench(study);
  SELECT count(DISTINCT b.participant_id)::integer INTO registered
  FROM pedpsy.participant_group_bindings b
  JOIN pedpsy.participants p ON (p.study_id,p.id)=(b.study_id,b.participant_id) AND p.status='active'
  JOIN pedpsy.participant_contacts c ON (c.study_id,c.participant_id)=(b.study_id,b.participant_id) AND c.status='active'
  WHERE b.study_id=study AND (group_filter IS NULL OR b.group_id=group_filter) AND c.email_key ~ '@example[.]test$';
  SELECT count(DISTINCT en.participant_id)::integer INTO completed_any
  FROM pedpsy.attempts a
  JOIN pedpsy.assignments z ON (z.study_id,z.id)=(a.study_id,a.assignment_id) AND z.status='active'
  JOIN pedpsy.stage_enrollments en ON (en.study_id,en.id)=(a.study_id,a.enrollment_id) AND en.status='active'
  JOIN pedpsy.participants p ON (p.study_id,p.id)=(en.study_id,en.participant_id) AND p.status='active'
  JOIN pedpsy.participant_contacts c ON (c.study_id,c.participant_id)=(en.study_id,en.participant_id) AND c.status='active'
  WHERE a.study_id=study AND a.status='completed' AND c.email_key ~ '@example[.]test$'
    AND (group_filter IS NULL OR z.group_id=group_filter) AND (stage_filter IS NULL OR z.stage_id=stage_filter);
  SELECT count(*)::integer INTO completed_all FROM (
    SELECT en.participant_id
    FROM pedpsy.attempts a
    JOIN pedpsy.assignments z ON (z.study_id,z.id)=(a.study_id,a.assignment_id) AND z.status='active'
    JOIN pedpsy.stage_enrollments en ON (en.study_id,en.id)=(a.study_id,a.enrollment_id) AND en.status='active'
    JOIN pedpsy.participants p ON (p.study_id,p.id)=(en.study_id,en.participant_id) AND p.status='active'
    JOIN pedpsy.participant_contacts c ON (c.study_id,c.participant_id)=(en.study_id,en.participant_id) AND c.status='active'
    WHERE a.study_id=study AND a.status='completed' AND c.email_key ~ '@example[.]test$'
      AND (group_filter IS NULL OR z.group_id=group_filter) AND (stage_filter IS NULL OR z.stage_id=stage_filter)
    GROUP BY en.participant_id
    HAVING count(DISTINCT z.id)=(
      SELECT count(DISTINCT z2.id) FROM pedpsy.assignments z2
      WHERE z2.study_id=study AND z2.status='active'
        AND (group_filter IS NULL OR z2.group_id=group_filter) AND (stage_filter IS NULL OR z2.stage_id=stage_filter)
    )
  ) q;
  WITH filtered AS (
    SELECT z.release_id,en.participant_id,a.id attempt_id,a.completed_at
    FROM pedpsy.attempts a
    JOIN pedpsy.assignments z ON (z.study_id,z.id)=(a.study_id,a.assignment_id) AND z.status='active'
    JOIN pedpsy.stage_enrollments en ON (en.study_id,en.id)=(a.study_id,a.enrollment_id) AND en.status='active'
    WHERE a.study_id=study AND a.status='completed'
      AND (group_filter IS NULL OR z.group_id=group_filter) AND (stage_filter IS NULL OR z.stage_id=stage_filter)
  ), latest AS (
    SELECT DISTINCT ON (release_id,participant_id) release_id,participant_id,attempt_id
    FROM filtered ORDER BY release_id,participant_id,completed_at DESC NULLS LAST,attempt_id
  ), payloads AS (
    SELECT l.release_id,l.participant_id,ar.payload
    FROM latest l JOIN pedpsy.attempt_results ar ON ar.attempt_id=l.attempt_id
  ), cls AS (
    SELECT p.release_id,c->>'code' code,c->>'label' label,c->>'value' value
    FROM payloads p CROSS JOIN LATERAL jsonb_array_elements(p.payload->'classifications') c
  ), ms AS (
    SELECT p.release_id,m->>'code' code,m->>'label' label,(m->>'value')::numeric value
    FROM payloads p CROSS JOIN LATERAL jsonb_array_elements(p.payload->'measures') m
    WHERE m->>'value_type'='number' AND (m->>'value') ~ '^-?[0-9]+([.][0-9]+)?$'
  ), sums AS (
    SELECT x.release_id,r.method_id,r.method_version_id,
      (SELECT count(*)::integer FROM payloads p WHERE p.release_id=x.release_id) completed,
      coalesce((SELECT jsonb_agg(jsonb_build_object('code',code,'label',label,'value',value,'count',CASE WHEN n>=3 THEN n END)) FROM (SELECT code,max(label) label,value,count(*) n FROM cls WHERE release_id=x.release_id GROUP BY code,value) q),'[]'::jsonb) levels,
      coalesce((SELECT jsonb_agg(jsonb_build_object('code',code,'label',label,'n',n,'mean',CASE WHEN n>=3 THEN mean END)) FROM (SELECT code,max(label) label,count(*) n,avg(value) mean FROM ms WHERE release_id=x.release_id GROUP BY code) q),'[]'::jsonb) measures
    FROM (SELECT DISTINCT release_id FROM filtered) x
    JOIN pedpsy.instrument_releases r ON r.id=x.release_id
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object('release_id',release_id,'method_id',method_id,'method_version_id',method_version_id,'completed',completed,'levels',levels,'measures',measures) ORDER BY method_id),'[]'::jsonb) INTO rows FROM sums;
  PERFORM pedpsy.constructor_audit('studies.method_analytics.read',study);
  RETURN jsonb_build_object('registered',registered,'completed_any',completed_any,'completed_all',completed_all,'rows',rows);
END $$;
REVOKE ALL ON FUNCTION research_method_analytics(uuid,uuid,uuid) FROM PUBLIC;
