SET LOCAL search_path=pedpsy,pg_catalog;
-- 155: every study must own a participant profile schema from the moment it is
-- created. Migration 145 only backfilled the studies that existed then; a study
-- created afterwards had no row at all, so the researcher cabinet had nothing to
-- render and the misleading "add a group" error locked the whole design editor.
--
-- The existing AFTER INSERT trigger already seeds the passport schema for demo
-- studies; it just skipped the research profile rows. Extend that function instead
-- of adding a second trigger, then backfill the studies created since 145.

INSERT INTO pedpsy.passport_schema_versions(study_id,schema_version,fields)
SELECT s.id,1,pedpsy.passport_basic_fields(false)
FROM pedpsy.studies s
WHERE NOT EXISTS(SELECT 1 FROM pedpsy.passport_schema_versions v WHERE v.study_id=s.id AND v.schema_version=1)
ON CONFLICT(study_id,schema_version) DO NOTHING;

INSERT INTO pedpsy.study_passport_schemas(study_id,schema_version)
SELECT s.id,1 FROM pedpsy.studies s
WHERE NOT EXISTS(SELECT 1 FROM pedpsy.study_passport_schemas p WHERE p.study_id=s.id)
  AND EXISTS(SELECT 1 FROM pedpsy.passport_schema_versions v WHERE v.study_id=s.id AND v.schema_version=1)
ON CONFLICT(study_id) DO NOTHING;

INSERT INTO pedpsy.research_profile_schemas(study_id,version,fields)
SELECT s.id,1,coalesce((SELECT v.fields FROM pedpsy.passport_schema_versions v WHERE v.study_id=s.id AND v.schema_version=1),pedpsy.passport_basic_fields(false))
FROM pedpsy.studies s
WHERE NOT EXISTS(SELECT 1 FROM pedpsy.research_profile_schemas r WHERE r.study_id=s.id)
ON CONFLICT(study_id,version) DO NOTHING;

INSERT INTO pedpsy.research_profile_defaults(study_id,version)
SELECT s.id,1 FROM pedpsy.studies s
WHERE NOT EXISTS(SELECT 1 FROM pedpsy.research_profile_defaults d WHERE d.study_id=s.id)
  AND EXISTS(SELECT 1 FROM pedpsy.research_profile_schemas r WHERE r.study_id=s.id AND r.version=1)
ON CONFLICT(study_id) DO NOTHING;

CREATE OR REPLACE FUNCTION pedpsy.initialize_passport_schema() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
BEGIN
  IF NEW.dataset_kind='demo' THEN
    INSERT INTO pedpsy.passport_schema_versions(study_id,schema_version,fields) VALUES(NEW.id,1,pedpsy.passport_basic_fields()) ON CONFLICT(study_id,schema_version) DO NOTHING;
    INSERT INTO pedpsy.study_passport_schemas(study_id,schema_version) VALUES(NEW.id,1) ON CONFLICT(study_id) DO NOTHING;
    -- A study without these two rows cannot render the participant profile step.
    INSERT INTO pedpsy.research_profile_schemas(study_id,version,fields) VALUES(NEW.id,1,pedpsy.passport_basic_fields()) ON CONFLICT(study_id,version) DO NOTHING;
    INSERT INTO pedpsy.research_profile_defaults(study_id,version) VALUES(NEW.id,1) ON CONFLICT(study_id) DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION pedpsy.initialize_passport_schema() FROM PUBLIC;
