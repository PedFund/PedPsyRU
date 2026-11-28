SET LOCAL search_path=pedpsy,pg_catalog;
-- 155: a study must always own the passport schema *pointer*, not only the
-- versioned fields. The deployed trigger creates passport_schema_versions but
-- never the study_passport_schemas row, so research_schema() (which inner-joins
-- the pointer) returns NULL. The cabinet then sees an empty schema, throws the
-- misleading "add a group" error and locks the whole design editor.
--
-- Restore the invariant in the function that creates studies, then backfill the
-- studies that were created while the pointer was missing. No research_profile_*
-- rows are seeded here: research_schema() already falls back to the passport
-- schema, and seeding them would make the legacy passport flow disagree with
-- require_legacy_profile_entry().

INSERT INTO pedpsy.study_passport_schemas(study_id,schema_version)
SELECT v.study_id,min(v.schema_version)
FROM pedpsy.passport_schema_versions v
WHERE NOT EXISTS(SELECT 1 FROM pedpsy.study_passport_schemas p WHERE p.study_id=v.study_id)
GROUP BY v.study_id
ON CONFLICT(study_id) DO NOTHING;

CREATE OR REPLACE FUNCTION pedpsy.initialize_passport_schema() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
BEGIN
  IF NEW.dataset_kind='demo' THEN
    INSERT INTO pedpsy.passport_schema_versions(study_id,schema_version,fields)
      VALUES(NEW.id,1,pedpsy.passport_basic_fields())
      ON CONFLICT(study_id,schema_version) DO NOTHING;
    -- The pointer row is what research_schema() and the cabinet read.
    INSERT INTO pedpsy.study_passport_schemas(study_id,schema_version)
      VALUES(NEW.id,1)
      ON CONFLICT(study_id) DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION pedpsy.initialize_passport_schema() FROM PUBLIC;
