SET LOCAL search_path=pedpsy,pg_catalog;
-- 080: aggregate the effective completed participant profile for the researcher.
-- Current profiles live in research_profile_history; legacy synthetic rows still
-- live in participant_passports. Only counts leave the DB; cells below three are nulled.
CREATE OR REPLACE FUNCTION research_participant_passport_stats(study uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE fields jsonb;total integer;average_age numeric;field_data jsonb;age_data jsonb;
BEGIN
  PERFORM pedpsy.lock_research_workbench(study);
  SELECT q.fields INTO fields FROM (
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
  WHERE ct.email_key ~ '@example[.]test$';
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
      SELECT jsonb_agg(jsonb_build_object('value',v.value,'label',coalesce(o.label,v.value),'count',CASE WHEN v.n>=3 THEN v.n END))
      FROM (
        SELECT c.answers->>(f->>'key') value,count(*)::integer n
        FROM combined c
        JOIN pedpsy.participants p ON (p.study_id,p.id)=(study,c.participant_id) AND p.status='active'
        JOIN pedpsy.participant_contacts ct ON (ct.study_id,ct.participant_id)=(study,c.participant_id) AND ct.status='active'
        WHERE ct.email_key ~ '@example[.]test$' AND c.answers ? (f->>'key') AND nullif(c.answers->>(f->>'key'),'') IS NOT NULL
        GROUP BY 1
      ) v
      LEFT JOIN LATERAL (
        SELECT o->>'label' label FROM jsonb_array_elements(coalesce(f->'options','[]'::jsonb)) o
        WHERE o->>'value'=v.value LIMIT 1
      ) o ON true
    ),'[]'::jsonb)
  ) ORDER BY f->>'key'),'[]'::jsonb) INTO field_data
  FROM jsonb_array_elements(coalesce(fields,'[]'::jsonb)) f;
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
  SELECT coalesce(jsonb_agg(jsonb_build_object('label',b.bucket,'count',CASE WHEN b.n>=3 THEN b.n END) ORDER BY b.bucket),'[]'::jsonb)
  INTO age_data FROM (
    SELECT CASE WHEN age<25 THEN '18–24' WHEN age<35 THEN '25–34' WHEN age<45 THEN '35–44'
      WHEN age<55 THEN '45–54' ELSE '55+' END bucket,count(*)::integer n
    FROM (
      SELECT (c.answers->>'age')::integer age
      FROM combined c
      JOIN pedpsy.participants p ON (p.study_id,p.id)=(study,c.participant_id) AND p.status='active'
      JOIN pedpsy.participant_contacts ct ON (ct.study_id,ct.participant_id)=(study,c.participant_id) AND ct.status='active'
      WHERE ct.email_key ~ '@example[.]test$' AND c.answers->>'age' ~ '^[0-9]+$'
    ) a GROUP BY 1
  ) b;
  PERFORM pedpsy.constructor_audit('studies.participants.passport_stats',study);
  RETURN jsonb_build_object('total',total,'average_age',average_age,'fields',field_data,'age_buckets',age_data);
END $$;
REVOKE ALL ON FUNCTION research_participant_passport_stats(uuid) FROM PUBLIC;
