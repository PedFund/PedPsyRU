SET LOCAL search_path=pedpsy,pg_catalog;
-- 080: aggregate the completed participant passport for the researcher.
-- Only counts are returned; cells below three are nulled before leaving the DB.
CREATE OR REPLACE FUNCTION research_participant_passport_stats(study uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE fields jsonb;total integer;average_age numeric;field_data jsonb;age_data jsonb;
BEGIN
  PERFORM pedpsy.lock_research_workbench(study);
  SELECT v.fields INTO fields
  FROM pedpsy.study_passport_schemas p
  JOIN pedpsy.passport_schema_versions v ON (v.study_id,v.schema_version)=(p.study_id,p.schema_version)
  WHERE p.study_id=study;
  SELECT count(*)::integer,round(avg((pp.answers->>'age')::numeric),1) INTO total,average_age
  FROM pedpsy.participant_passports pp
  JOIN pedpsy.participants p ON (p.study_id,p.id)=(pp.study_id,pp.participant_id) AND p.status='active'
  JOIN pedpsy.participant_contacts c ON (c.study_id,c.participant_id)=(pp.study_id,pp.participant_id) AND c.status='active'
  WHERE pp.study_id=study AND pp.status='completed' AND c.email_key ~ '@example[.]test$';
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'key',f->>'key','label',f->>'label','kind',f->>'kind',
    'values',coalesce((
      SELECT jsonb_agg(jsonb_build_object('value',v.value,'label',coalesce(o.label,v.value),'count',CASE WHEN v.n>=3 THEN v.n END))
      FROM (
        SELECT pp.answers->>(f->>'key') value,count(*)::integer n
        FROM pedpsy.participant_passports pp
        JOIN pedpsy.participants p ON (p.study_id,p.id)=(pp.study_id,pp.participant_id) AND p.status='active'
        JOIN pedpsy.participant_contacts c ON (c.study_id,c.participant_id)=(pp.study_id,pp.participant_id) AND c.status='active'
        WHERE pp.study_id=study AND pp.status='completed' AND c.email_key ~ '@example[.]test$'
          AND pp.answers ? (f->>'key') AND nullif(pp.answers->>(f->>'key'),'') IS NOT NULL
        GROUP BY 1
      ) v
      LEFT JOIN LATERAL (
        SELECT o->>'label' label FROM jsonb_array_elements(coalesce(f->'options','[]'::jsonb)) o
        WHERE o->>'value'=v.value LIMIT 1
      ) o ON true
    ),'[]'::jsonb)
  ) ORDER BY f->>'key'),'[]'::jsonb) INTO field_data
  FROM jsonb_array_elements(coalesce(fields,'[]'::jsonb)) f;
  SELECT coalesce(jsonb_agg(jsonb_build_object('label',b.bucket,'count',CASE WHEN b.n>=3 THEN b.n END) ORDER BY b.bucket),'[]'::jsonb)
  INTO age_data FROM (
    SELECT CASE WHEN age<25 THEN '18–24' WHEN age<35 THEN '25–34' WHEN age<45 THEN '35–44'
      WHEN age<55 THEN '45–54' ELSE '55+' END bucket,count(*)::integer n
    FROM (
      SELECT (pp.answers->>'age')::integer age
      FROM pedpsy.participant_passports pp
      JOIN pedpsy.participants p ON (p.study_id,p.id)=(pp.study_id,pp.participant_id) AND p.status='active'
      JOIN pedpsy.participant_contacts c ON (c.study_id,c.participant_id)=(pp.study_id,pp.participant_id) AND c.status='active'
      WHERE pp.study_id=study AND pp.status='completed' AND c.email_key ~ '@example[.]test$'
        AND pp.answers->>'age' ~ '^[0-9]+$'
    ) a GROUP BY 1
  ) b;
  PERFORM pedpsy.constructor_audit('studies.participants.passport_stats',study);
  RETURN jsonb_build_object('total',total,'average_age',average_age,'fields',field_data,'age_buckets',age_data);
END $$;
REVOKE ALL ON FUNCTION research_participant_passport_stats(uuid) FROM PUBLIC;
