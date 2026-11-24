SET LOCAL search_path=pedpsy,pg_catalog;
-- 137: a newly created study starts with the required education field.
-- Existing pinned schema versions are not rewritten.
CREATE OR REPLACE FUNCTION pedpsy.initialize_passport_schema() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
BEGIN
  INSERT INTO pedpsy.passport_schema_versions(study_id,schema_version,fields)
    VALUES(NEW.id,1,pedpsy.passport_selected_basic_fields('["sex","age","city","education"]'::jsonb));
  RETURN NEW;
END $$;
