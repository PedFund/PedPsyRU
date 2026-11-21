SET LOCAL search_path=pedpsy,pg_catalog;
-- 115: the researcher progress projection still admitted only synthetic contacts, so a
-- real participant who passed methods never appeared in "Ход исследования". The contact
-- join stays (active contacts only) but the @example.test predicate is gone; the export
-- limit and the active-status rules are unchanged.
CREATE OR REPLACE FUNCTION research_progress_rows_v2(study uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE data jsonb;count_rows integer;
BEGIN
  SELECT count(*)::integer,coalesce(jsonb_agg(jsonb_build_object('participant_id',q.participant_id,'group_id',q.group_id,'stage_id',q.stage_id,'status',q.status) ORDER BY q.group_id,q.stage_id,q.participant_id),'[]'::jsonb) INTO count_rows,data
  FROM (SELECT b.participant_id,b.group_id,t.id stage_id,
    CASE WHEN x.total>0 AND x.finished=x.total THEN 'completed' WHEN x.started>0 THEN 'in_progress' ELSE 'not_started' END status
    FROM pedpsy.participant_group_bindings b JOIN pedpsy.participants p ON (p.study_id,p.id)=(b.study_id,b.participant_id) AND p.status='active'
    JOIN pedpsy.research_groups g ON (g.study_id,g.id)=(b.study_id,b.group_id) AND g.status='active'
    JOIN pedpsy.participant_contacts c ON (c.study_id,c.participant_id)=(b.study_id,b.participant_id) AND c.status='active'
    JOIN pedpsy.research_stages t ON t.study_id=b.study_id AND t.status='active'
    CROSS JOIN LATERAL (SELECT count(*) total,count(*) FILTER(WHERE a.status='completed') finished,count(*) FILTER(WHERE a.status='completed' OR EXISTS(SELECT 1 FROM pedpsy.responses r WHERE r.study_id=a.study_id AND r.attempt_id=a.id)) started
      FROM pedpsy.assignments z LEFT JOIN pedpsy.attempts a ON a.study_id=z.study_id AND a.assignment_id=z.id AND a.enrollment_id IN (SELECT en.id FROM pedpsy.stage_enrollments en WHERE en.study_id=b.study_id AND en.participant_id=b.participant_id)
      LEFT JOIN pedpsy.stage_enrollments e ON (e.study_id,e.id)=(a.study_id,a.enrollment_id)
      WHERE z.study_id=b.study_id AND z.group_id=b.group_id AND z.stage_id=t.id AND z.status='active' AND (e.id IS NULL OR e.status='active')) x
    WHERE b.study_id=study ORDER BY b.participant_id,t.id LIMIT 501) q;
  IF count_rows>500 OR octet_length(data::text)>1048576 THEN RAISE EXCEPTION 'EXPORT_LIMIT' USING ERRCODE='54000';END IF;
  RETURN data;
END $$;
REVOKE ALL ON FUNCTION research_progress_rows_v2(uuid) FROM PUBLIC;
