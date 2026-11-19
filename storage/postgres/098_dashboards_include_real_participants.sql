SET LOCAL search_path=pedpsy,pg_catalog;
-- 098: real e-mail participants must appear in the researcher dashboards. The old
-- synthetic-domain predicate excluded every real address once real mail was enabled.
-- The analytics and passport-stats definitions also keep the 084 no-suppression rule.
CREATE OR REPLACE FUNCTION research_method_progress(study uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE registered integer;completed_any integer;rows jsonb;
BEGIN
  PERFORM pedpsy.lock_research_workbench(study);
  SELECT count(DISTINCT b.participant_id)::integer INTO registered
  FROM pedpsy.participant_group_bindings b
  JOIN pedpsy.participants p ON (p.study_id,p.id)=(b.study_id,b.participant_id) AND p.status='active'
  JOIN pedpsy.participant_contacts c ON (c.study_id,c.participant_id)=(b.study_id,b.participant_id) AND c.status='active'
  WHERE b.study_id=study;
  SELECT count(DISTINCT en.participant_id)::integer INTO completed_any
  FROM pedpsy.attempts a
  JOIN pedpsy.assignments z ON (z.study_id,z.id)=(a.study_id,a.assignment_id) AND z.status='active'
  JOIN pedpsy.stage_enrollments en ON (en.study_id,en.id)=(a.study_id,a.enrollment_id) AND en.status='active'
  JOIN pedpsy.participants p ON (p.study_id,p.id)=(en.study_id,en.participant_id) AND p.status='active'
  JOIN pedpsy.participant_contacts c ON (c.study_id,c.participant_id)=(en.study_id,en.participant_id) AND c.status='active'
  WHERE a.study_id=study AND a.status='completed';
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
    WHERE a.study_id=study AND a.status='completed'
  ) x ON true;
  PERFORM pedpsy.constructor_audit('studies.method_progress.read',study);
  RETURN jsonb_build_object('registered',registered,'completed_any',completed_any,'rows',rows);
END $$;
CREATE OR REPLACE FUNCTION research_method_analytics(study uuid, group_filter uuid DEFAULT NULL, stage_filter uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE registered integer;completed_any integer;completed_all integer;rows jsonb;
BEGIN
  PERFORM pedpsy.lock_research_workbench(study);
  SELECT count(DISTINCT b.participant_id)::integer INTO registered
  FROM pedpsy.participant_group_bindings b
  JOIN pedpsy.participants p ON (p.study_id,p.id)=(b.study_id,b.participant_id) AND p.status='active'
  JOIN pedpsy.participant_contacts c ON (c.study_id,c.participant_id)=(b.study_id,b.participant_id) AND c.status='active'
  WHERE b.study_id=study AND (group_filter IS NULL OR b.group_id=group_filter);
  SELECT count(DISTINCT en.participant_id)::integer INTO completed_any
  FROM pedpsy.attempts a
  JOIN pedpsy.assignments z ON (z.study_id,z.id)=(a.study_id,a.assignment_id) AND z.status='active'
  JOIN pedpsy.stage_enrollments en ON (en.study_id,en.id)=(a.study_id,a.enrollment_id) AND en.status='active'
  JOIN pedpsy.participants p ON (p.study_id,p.id)=(en.study_id,en.participant_id) AND p.status='active'
  JOIN pedpsy.participant_contacts c ON (c.study_id,c.participant_id)=(en.study_id,en.participant_id) AND c.status='active'
  WHERE a.study_id=study AND a.status='completed'
    AND (group_filter IS NULL OR z.group_id=group_filter) AND (stage_filter IS NULL OR z.stage_id=stage_filter);
  SELECT count(*)::integer INTO completed_all FROM (
    SELECT en.participant_id
    FROM pedpsy.attempts a
    JOIN pedpsy.assignments z ON (z.study_id,z.id)=(a.study_id,a.assignment_id) AND z.status='active'
    JOIN pedpsy.stage_enrollments en ON (en.study_id,en.id)=(a.study_id,a.enrollment_id) AND en.status='active'
    JOIN pedpsy.participants p ON (p.study_id,p.id)=(en.study_id,en.participant_id) AND p.status='active'
    JOIN pedpsy.participant_contacts c ON (c.study_id,c.participant_id)=(en.study_id,en.participant_id) AND c.status='active'
    WHERE a.study_id=study AND a.status='completed'
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
      coalesce((SELECT jsonb_agg(jsonb_build_object('code',code,'label',label,'value',value,'count',n)) FROM (SELECT code,max(label) label,value,count(*) n FROM cls WHERE release_id=x.release_id GROUP BY code,value) q),'[]'::jsonb) levels,
      coalesce((SELECT jsonb_agg(jsonb_build_object('code',code,'label',label,'n',n,'mean',mean)) FROM (SELECT code,max(label) label,count(*) n,avg(value) mean FROM ms WHERE release_id=x.release_id GROUP BY code) q),'[]'::jsonb) measures
    FROM (SELECT DISTINCT release_id FROM filtered) x
    JOIN pedpsy.instrument_releases r ON r.id=x.release_id
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object('release_id',release_id,'method_id',method_id,'method_version_id',method_version_id,'completed',completed,'levels',levels,'measures',measures) ORDER BY method_id),'[]'::jsonb) INTO rows FROM sums;
  PERFORM pedpsy.constructor_audit('studies.method_analytics.read',study);
  RETURN jsonb_build_object('registered',registered,'completed_any',completed_any,'completed_all',completed_all,'rows',rows);
END $$;
CREATE OR REPLACE FUNCTION research_participant_passport_stats(study uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE current_fields jsonb;total integer;average_age numeric;field_data jsonb;age_data jsonb;
BEGIN
  PERFORM pedpsy.lock_research_workbench(study);
  SELECT q.fields INTO current_fields FROM (
    (SELECT v.fields,1 priority FROM pedpsy.research_profile_schemas v WHERE v.study_id=study ORDER BY v.version DESC LIMIT 1)
    UNION ALL
    (SELECT v.fields,2 priority FROM pedpsy.passport_schema_versions v WHERE v.study_id=study ORDER BY v.schema_version DESC LIMIT 1)
  ) q ORDER BY q.priority LIMIT 1;
  WITH latest AS (
    SELECT DISTINCT ON (participant_id) participant_id,fields,answers
    FROM pedpsy.research_profile_history WHERE study_id=study ORDER BY participant_id,revision DESC
  ), legacy AS (
    SELECT pp.participant_id,v.fields,pp.answers
    FROM pedpsy.participant_passports pp
    JOIN pedpsy.passport_schema_versions v ON (v.study_id,v.schema_version)=(pp.study_id,pp.schema_version)
    WHERE pp.study_id=study AND pp.status='completed'
  ), combined AS (
    SELECT participant_id,fields,answers FROM latest
    UNION ALL
    SELECT l.participant_id,l.fields,l.answers FROM legacy l
    WHERE NOT EXISTS(SELECT 1 FROM latest x WHERE x.participant_id=l.participant_id)
  )
  SELECT count(*)::integer,round(avg((c.answers->>'age')::numeric),1) INTO total,average_age
  FROM combined c
  JOIN pedpsy.participants p ON (p.study_id,p.id)=(study,c.participant_id) AND p.status='active'
  JOIN pedpsy.participant_contacts ct ON (ct.study_id,ct.participant_id)=(study,c.participant_id) AND ct.status='active'
  WHERE true;
  WITH latest AS (
    SELECT DISTINCT ON (participant_id) participant_id,fields,answers
    FROM pedpsy.research_profile_history WHERE study_id=study ORDER BY participant_id,revision DESC
  ), legacy AS (
    SELECT pp.participant_id,v.fields,pp.answers
    FROM pedpsy.participant_passports pp
    JOIN pedpsy.passport_schema_versions v ON (v.study_id,v.schema_version)=(pp.study_id,pp.schema_version)
    WHERE pp.study_id=study AND pp.status='completed'
  ), combined AS (
    SELECT participant_id,fields,answers FROM latest
    UNION ALL
    SELECT l.participant_id,l.fields,l.answers FROM legacy l
    WHERE NOT EXISTS(SELECT 1 FROM latest x WHERE x.participant_id=l.participant_id)
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'key',f->>'key','label',f->>'label','kind',f->>'kind',
    'values',coalesce((
      SELECT jsonb_agg(jsonb_build_object('value',v.value,'label',coalesce(o.label,v.value),'count',v.n))
      FROM (
        SELECT c.answers->>(f->>'key') value,count(*)::integer n
        FROM combined c
        JOIN pedpsy.participants p ON (p.study_id,p.id)=(study,c.participant_id) AND p.status='active'
        JOIN pedpsy.participant_contacts ct ON (ct.study_id,ct.participant_id)=(study,c.participant_id) AND ct.status='active'
        WHERE c.answers ? (f->>'key') AND nullif(c.answers->>(f->>'key'),'') IS NOT NULL
        GROUP BY 1
      ) v
      LEFT JOIN LATERAL (
        SELECT o->>'label' label FROM jsonb_array_elements(coalesce(f->'options','[]'::jsonb)) o
        WHERE o->>'value'=v.value LIMIT 1
      ) o ON true
    ),'[]'::jsonb)
  ) ORDER BY f->>'key'),'[]'::jsonb) INTO field_data
  FROM jsonb_array_elements(coalesce(current_fields,'[]'::jsonb)) f;
  WITH latest AS (
    SELECT DISTINCT ON (participant_id) participant_id,answers
    FROM pedpsy.research_profile_history WHERE study_id=study ORDER BY participant_id,revision DESC
  ), legacy AS (
    SELECT pp.participant_id,pp.answers FROM pedpsy.participant_passports pp
    WHERE pp.study_id=study AND pp.status='completed'
  ), combined AS (
    SELECT participant_id,answers FROM latest
    UNION ALL
    SELECT l.participant_id,l.answers FROM legacy l
    WHERE NOT EXISTS(SELECT 1 FROM latest x WHERE x.participant_id=l.participant_id)
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object('label',b.bucket,'count',b.n) ORDER BY b.bucket),'[]'::jsonb)
  INTO age_data FROM (
    SELECT CASE WHEN age<25 THEN '18вЂ“24' WHEN age<35 THEN '25вЂ“34' WHEN age<45 THEN '35вЂ“44'
      WHEN age<55 THEN '45вЂ“54' ELSE '55+' END bucket,count(*)::integer n
    FROM (
      SELECT (c.answers->>'age')::integer age
      FROM combined c
      JOIN pedpsy.participants p ON (p.study_id,p.id)=(study,c.participant_id) AND p.status='active'
      JOIN pedpsy.participant_contacts ct ON (ct.study_id,ct.participant_id)=(study,c.participant_id) AND ct.status='active'
      WHERE c.answers->>'age' ~ '^[0-9]+$'
    ) a GROUP BY 1
  ) b;
  PERFORM pedpsy.constructor_audit('studies.participants.passport_stats',study);
  RETURN jsonb_build_object('total',total,'average_age',average_age,'fields',field_data,'age_buckets',age_data);
END $$;
CREATE OR REPLACE FUNCTION research_progress_rows(study uuid) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
 SELECT coalesce(jsonb_agg(x),'[]'::jsonb) FROM jsonb_array_elements(pedpsy.research_progress_rows_v2(study)) x
 WHERE NOT EXISTS(SELECT 1 FROM pedpsy.stage_enrollments e WHERE e.study_id=study AND e.participant_id=(x->>'participant_id')::uuid AND e.stage_id=(x->>'stage_id')::uuid AND e.status<>'active')
$$;
