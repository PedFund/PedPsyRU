SET LOCAL search_path=pedpsy,pg_catalog;
-- 119: pseudonymous results export for the study owner. One row per participant and
-- release (the latest valid attempt), no contact data, invalidated attempts excluded.
CREATE OR REPLACE FUNCTION research_results_export(study uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE rows jsonb;
BEGIN
  PERFORM pedpsy.lock_research_workbench(study);
  WITH filtered AS (
    SELECT z.release_id,en.participant_id,a.id attempt_id,a.completed_at
    FROM pedpsy.attempts a
    JOIN pedpsy.assignments z ON (z.study_id,z.id)=(a.study_id,a.assignment_id) AND z.status='active'
    JOIN pedpsy.stage_enrollments en ON (en.study_id,en.id)=(a.study_id,a.enrollment_id) AND en.status='active'
    JOIN pedpsy.participants p ON (p.study_id,p.id)=(en.study_id,en.participant_id) AND p.status='active'
    JOIN pedpsy.participant_contacts c ON (c.study_id,c.participant_id)=(en.study_id,en.participant_id) AND c.status='active'
    WHERE a.study_id=study AND a.status='completed'
      AND NOT EXISTS(SELECT 1 FROM pedpsy.attempt_invalidations i WHERE i.attempt_id=a.id)
  ), latest AS (
    SELECT DISTINCT ON (release_id,participant_id) release_id,participant_id,attempt_id,completed_at
    FROM filtered ORDER BY release_id,participant_id,completed_at DESC NULLS LAST,attempt_id
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'participant_id',l.participant_id,'release_id',l.release_id,'method_id',r.method_id,
      'method_version_id',r.method_version_id,'attempt_id',l.attempt_id,'completed_at',l.completed_at,
      'measures',coalesce(ar.payload->'measures','[]'::jsonb),
      'classifications',coalesce(ar.payload->'classifications','[]'::jsonb)) ORDER BY r.method_id,l.participant_id),'[]'::jsonb)
    INTO rows
    FROM latest l JOIN pedpsy.instrument_releases r ON r.id=l.release_id
      JOIN pedpsy.attempt_results ar ON ar.attempt_id=l.attempt_id;
  PERFORM pedpsy.constructor_audit('studies.results.export',study);
  RETURN jsonb_build_object('study_id',study,'rows',rows);
END $$;
REVOKE ALL ON FUNCTION research_results_export(uuid) FROM PUBLIC;
