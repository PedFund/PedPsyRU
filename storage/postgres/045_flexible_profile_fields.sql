SET LOCAL search_path=pedpsy,pg_catalog;
-- Researcher-selected participant profile fields. Existing immutable schema
-- versions and completed participant profiles are intentionally untouched.
CREATE FUNCTION passport_selected_basic_fields(selected jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE key text;result jsonb:='[]'::jsonb;seen text[]:=ARRAY[]::text[];
BEGIN
  IF selected IS NULL OR jsonb_typeof(selected)<>'array' OR jsonb_array_length(selected)>5 THEN
    RAISE EXCEPTION 'INVALID_PASSPORT_SCHEMA' USING ERRCODE='22023';
  END IF;
  FOR key IN SELECT value FROM jsonb_array_elements_text(selected) LOOP
    IF key NOT IN ('sex','age','city','organization','education') OR key=ANY(seen) THEN
      RAISE EXCEPTION 'INVALID_PASSPORT_SCHEMA' USING ERRCODE='22023';
    END IF;
    seen:=array_append(seen,key);
  END LOOP;
  FOREACH key IN ARRAY ARRAY['sex','age','city','organization','education'] LOOP
    IF key=ANY(seen) THEN
      result:=result||CASE key
        WHEN 'sex' THEN '[{"key":"sex","label":"Пол","required":true,"kind":"single_choice","options":[{"value":"female","label":"Женский"},{"value":"male","label":"Мужской"}]}]'::jsonb
        WHEN 'age' THEN '[{"key":"age","label":"Возраст","required":true,"kind":"integer","min":0,"max":130}]'::jsonb
        WHEN 'city' THEN '[{"key":"city","label":"Город","required":false,"kind":"text","max_length":100}]'::jsonb
        WHEN 'organization' THEN '[{"key":"organization","label":"Организация","required":false,"kind":"text","max_length":200}]'::jsonb
        ELSE '[{"key":"education","label":"Образование","required":false,"kind":"text","max_length":200}]'::jsonb
      END;
    END IF;
  END LOOP;
  RETURN result;
END $$;

CREATE OR REPLACE FUNCTION passport_fields_valid(fields jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,pedpsy AS $$
DECLARE f jsonb;key text;selected jsonb:='[]'::jsonb;extra jsonb:='[]'::jsonb;in_extra boolean:=false;expected jsonb;
BEGIN
  IF fields IS NULL OR jsonb_typeof(fields)<>'array' OR jsonb_array_length(fields)>10 THEN RETURN false;END IF;
  FOR f IN SELECT value FROM jsonb_array_elements(fields) LOOP
    key:=f->>'key';
    IF key IN ('sex','age','city','organization','education') THEN
      IF in_extra THEN RETURN false;END IF;
      selected:=selected||jsonb_build_array(key);
    ELSE
      in_extra:=true;extra:=extra||jsonb_build_array(f);
    END IF;
  END LOOP;
  BEGIN expected:=pedpsy.passport_selected_basic_fields(selected);EXCEPTION WHEN SQLSTATE '22023' THEN RETURN false;END;
  RETURN fields=expected||extra AND pedpsy.passport_additional_valid(extra);
END $$;

CREATE FUNCTION change_research_profile_schema(study uuid,expected integer,input jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE target uuid;new_version integer;fields jsonb;schema_snapshot jsonb;
BEGIN
  PERFORM pedpsy.lock_research_workbench(study,expected);
  IF input IS NULL OR jsonb_typeof(input)<>'object' OR jsonb_typeof(input->'all')<>'boolean'
    OR jsonb_typeof(input->'basic_fields')<>'array' OR NOT pedpsy.passport_additional_valid(input->'fields') THEN
    RAISE EXCEPTION 'INVALID_PASSPORT_SCHEMA' USING ERRCODE='22023';
  END IF;
  IF (SELECT status FROM pedpsy.studies WHERE id=study)='closed' THEN
    RAISE EXCEPTION 'DESIGN_FROZEN' USING ERRCODE='P0001';
  END IF;
  target:=(input->>'group_id')::uuid;
  IF NOT (input->>'all')::boolean AND NOT EXISTS(
    SELECT 1 FROM pedpsy.research_groups WHERE study_id=study AND id=target
  ) THEN RAISE EXCEPTION 'NOT_AVAILABLE' USING ERRCODE='P0002';END IF;
  schema_snapshot:=pedpsy.research_schema(study,target);
  IF (input->>'schema_version')::integer IS DISTINCT FROM (schema_snapshot->>'schema_version')::integer THEN
    RAISE EXCEPTION 'PASSPORT_SCHEMA_CONFLICT' USING ERRCODE='P0001';
  END IF;
  fields:=pedpsy.passport_selected_basic_fields(input->'basic_fields')||(input->'fields');
  IF NOT pedpsy.passport_fields_valid(fields) THEN RAISE EXCEPTION 'INVALID_PASSPORT_SCHEMA' USING ERRCODE='22023';END IF;
  IF fields=schema_snapshot->'fields' THEN
    PERFORM pedpsy.constructor_audit('studies.profile_schema.configure',study);
    RETURN pedpsy.research_workbench_snapshot(study);
  END IF;
  SELECT greatest(coalesce(max(version),0),coalesce((
    SELECT max(schema_version) FROM pedpsy.passport_schema_versions WHERE study_id=study
  ),0))+1 INTO new_version FROM pedpsy.research_profile_schemas WHERE study_id=study;
  IF new_version>100 THEN RAISE EXCEPTION 'DESIGN_LIMIT' USING ERRCODE='54000';END IF;
  INSERT INTO pedpsy.research_profile_schemas VALUES(study,new_version,fields);
  IF (input->>'all')::boolean THEN
    INSERT INTO pedpsy.research_profile_defaults VALUES(study,new_version)
      ON CONFLICT(study_id) DO UPDATE SET version=excluded.version;
    DELETE FROM pedpsy.research_profile_groups WHERE study_id=study;
  ELSE
    INSERT INTO pedpsy.research_profile_groups VALUES(study,target,new_version)
      ON CONFLICT(study_id,group_id) DO UPDATE SET version=excluded.version;
  END IF;
  PERFORM pedpsy.finish_study_design(study,'studies.profile_schema.configure');
  PERFORM pedpsy.constructor_audit('studies.workbench.configure',study);
  RETURN pedpsy.research_workbench_snapshot(study);
END $$;

REVOKE ALL ON FUNCTION passport_selected_basic_fields(jsonb),change_research_profile_schema(uuid,integer,jsonb) FROM PUBLIC;
