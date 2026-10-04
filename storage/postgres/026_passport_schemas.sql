SET LOCAL search_path=pedpsy,pg_catalog;
-- Owner decision: sex/age required; researcher controls other fields, max5 own questions.
-- No diagnostic values, contact identity, scores or psychometric keys.
CREATE FUNCTION passport_basic_fields(city_required boolean DEFAULT false) RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
  SELECT '[{"key":"sex","label":"Пол","required":true,"kind":"single_choice","options":[{"value":"female","label":"Женский"},{"value":"male","label":"Мужской"}]},{"key":"age","label":"Возраст","required":true,"kind":"integer","min":0,"max":130}]'::jsonb
    ||jsonb_build_array(jsonb_build_object('key','city','label','Город','required',city_required,'kind','text','max_length',100))
$$;
CREATE FUNCTION passport_additional_valid(fields jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE f jsonb;o jsonb;keys text[];seen text[]:=ARRAY[]::text[];choices text[];expected text[];
BEGIN
  IF fields IS NULL OR jsonb_typeof(fields)<>'array' THEN RETURN false;END IF;
  IF jsonb_array_length(fields)>5 THEN RETURN false;END IF;
  FOR f IN SELECT value FROM jsonb_array_elements(fields) LOOP
    IF jsonb_typeof(f)<>'object' THEN RETURN false;END IF;
    SELECT array_agg(key ORDER BY key) INTO keys FROM jsonb_object_keys(f) key;
    IF f->>'kind'='text' THEN expected:=ARRAY['key','kind','label','max_length','required'];
    ELSIF f->>'kind'='integer' THEN expected:=ARRAY['key','kind','label','max','min','required'];
    ELSIF f->>'kind'='single_choice' THEN expected:=ARRAY['key','kind','label','options','required'];
    ELSE RETURN false;END IF;
    IF keys IS DISTINCT FROM expected OR jsonb_typeof(f->'key')<>'string' OR f->>'key' !~ '^extra_[a-z][a-z0-9_]{0,31}$'
      OR f->>'key'=ANY(seen) OR jsonb_typeof(f->'required')<>'boolean' OR jsonb_typeof(f->'label')<>'string'
      OR length(f->>'label') NOT BETWEEN 1 AND 120 OR btrim(f->>'label')='' OR f->>'label'<>btrim(f->>'label') OR f->>'label' ~ '[[:cntrl:]]' THEN RETURN false;END IF;
    seen:=array_append(seen,f->>'key');
    IF f->>'kind'='text' THEN
      IF jsonb_typeof(f->'max_length')<>'number' OR f->>'max_length' !~ '^[0-9]{1,3}$' THEN RETURN false;END IF;
      IF (f->>'max_length')::integer NOT BETWEEN 1 AND 500 THEN RETURN false;END IF;
    ELSIF f->>'kind'='integer' THEN
      IF jsonb_typeof(f->'min')<>'number' OR jsonb_typeof(f->'max')<>'number' OR f->>'min' !~ '^-?[0-9]{1,7}$' OR f->>'max' !~ '^-?[0-9]{1,7}$' THEN RETURN false;END IF;
      IF (f->>'min')::integer NOT BETWEEN -1000000 AND 1000000 OR (f->>'max')::integer NOT BETWEEN -1000000 AND 1000000 OR (f->>'min')::integer>(f->>'max')::integer THEN RETURN false;END IF;
    ELSE
      IF jsonb_typeof(f->'options')<>'array' THEN RETURN false;END IF;
      IF jsonb_array_length(f->'options') NOT BETWEEN 1 AND 20 THEN RETURN false;END IF;choices:=ARRAY[]::text[];
      FOR o IN SELECT value FROM jsonb_array_elements(f->'options') LOOP
        IF jsonb_typeof(o)<>'object' THEN RETURN false;END IF;
        SELECT array_agg(key ORDER BY key) INTO keys FROM jsonb_object_keys(o) key;
        IF keys IS DISTINCT FROM ARRAY['label','value'] OR jsonb_typeof(o->'value')<>'string' OR o->>'value' !~ '^[a-z][a-z0-9_]{0,39}$'
          OR o->>'value'=ANY(choices) OR jsonb_typeof(o->'label')<>'string' OR length(o->>'label') NOT BETWEEN 1 AND 80
          OR btrim(o->>'label')='' OR o->>'label'<>btrim(o->>'label') OR o->>'label' ~ '[[:cntrl:]]' THEN RETURN false;END IF;
        choices:=array_append(choices,o->>'value');
      END LOOP;
    END IF;
  END LOOP;RETURN true;
END $$;
CREATE FUNCTION passport_fields_valid(fields jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,pedpsy AS $$
DECLARE extra jsonb;
BEGIN
  IF fields IS NULL OR jsonb_typeof(fields)<>'array' THEN RETURN false;END IF;
  IF jsonb_array_length(fields) NOT BETWEEN 3 AND 8 OR jsonb_typeof(fields->2->'required') IS DISTINCT FROM 'boolean' THEN RETURN false;END IF;
  IF jsonb_build_array(fields->0,fields->1,fields->2)<>pedpsy.passport_basic_fields((fields->2->>'required')::boolean) THEN RETURN false;END IF;
  SELECT coalesce(jsonb_agg(value ORDER BY ordinal),'[]'::jsonb) INTO extra FROM jsonb_array_elements(fields) WITH ORDINALITY a(value,ordinal) WHERE ordinal>3;
  RETURN pedpsy.passport_additional_valid(extra);
END $$;
CREATE TABLE passport_schema_versions(
  study_id uuid NOT NULL REFERENCES studies(id),schema_version integer NOT NULL CHECK(schema_version BETWEEN 1 AND 100),
  fields jsonb NOT NULL CHECK(pedpsy.passport_fields_valid(fields)),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(study_id,schema_version)
);
CREATE TABLE study_passport_schemas(
  study_id uuid PRIMARY KEY REFERENCES studies(id),schema_version integer NOT NULL,
  UNIQUE(study_id,schema_version),FOREIGN KEY(study_id,schema_version) REFERENCES passport_schema_versions(study_id,schema_version)
);
CREATE FUNCTION guard_passport_schema_version() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,pedpsy AS $$
BEGIN
  IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'passport schema version immutable' USING ERRCODE='23514';END IF;
  IF NEW.schema_version>1 AND (NOT EXISTS(SELECT 1 FROM pedpsy.studies WHERE id=NEW.study_id AND status='draft')
    OR EXISTS(SELECT 1 FROM pedpsy.attempts WHERE study_id=NEW.study_id)) THEN RAISE EXCEPTION 'DESIGN_FROZEN' USING ERRCODE='P0001';END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER passport_schema_version_guard BEFORE INSERT OR UPDATE OR DELETE ON passport_schema_versions FOR EACH ROW EXECUTE FUNCTION guard_passport_schema_version();
CREATE FUNCTION guard_passport_schema_pointer() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,pedpsy AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'passport schema pointer immutable' USING ERRCODE='23514';END IF;
  IF NEW.study_id<>OLD.study_id OR NEW.schema_version<>OLD.schema_version+1 THEN RAISE EXCEPTION 'passport schema pointer frozen' USING ERRCODE='23514';END IF;
  IF NOT EXISTS(SELECT 1 FROM pedpsy.studies WHERE id=NEW.study_id AND status='draft') OR EXISTS(SELECT 1 FROM pedpsy.attempts WHERE study_id=NEW.study_id) THEN RAISE EXCEPTION 'DESIGN_FROZEN' USING ERRCODE='P0001';END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER passport_schema_pointer_guard BEFORE UPDATE OR DELETE ON study_passport_schemas FOR EACH ROW EXECUTE FUNCTION guard_passport_schema_pointer();
-- Backfill question metadata only; existing participants/answers are untouched.
INSERT INTO passport_schema_versions(study_id,schema_version,fields) SELECT id,1,pedpsy.passport_basic_fields() FROM studies WHERE dataset_kind='demo';
INSERT INTO study_passport_schemas(study_id,schema_version) SELECT study_id,1 FROM passport_schema_versions;
CREATE FUNCTION initialize_passport_schema() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
BEGIN
  IF NEW.dataset_kind='demo' THEN
    INSERT INTO pedpsy.passport_schema_versions(study_id,schema_version,fields) VALUES(NEW.id,1,pedpsy.passport_basic_fields());
    INSERT INTO pedpsy.study_passport_schemas(study_id,schema_version) VALUES(NEW.id,1);
  END IF;RETURN NEW;
END $$;
CREATE TRIGGER study_passport_schema_initialize AFTER INSERT ON studies FOR EACH ROW EXECUTE FUNCTION initialize_passport_schema();
CREATE FUNCTION passport_schema_snapshot(study uuid) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
  SELECT jsonb_build_object('study_id',s.id,'study_version',s.design_version,'schema_version',v.schema_version,'fields',v.fields,
    'frozen',s.status<>'draft' OR EXISTS(SELECT 1 FROM pedpsy.attempts WHERE study_id=s.id))
  FROM pedpsy.studies s JOIN pedpsy.study_passport_schemas p ON p.study_id=s.id
    JOIN pedpsy.passport_schema_versions v ON v.study_id=p.study_id AND v.schema_version=p.schema_version WHERE s.id=study AND s.dataset_kind='demo'
$$;
CREATE FUNCTION read_passport_schema(study uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
BEGIN
  PERFORM pedpsy.lock_study_design(study,false);PERFORM pedpsy.constructor_audit('studies.passport_schema.read',study);
  RETURN pedpsy.passport_schema_snapshot(study);
END $$;
CREATE FUNCTION configure_passport_schema(study uuid,expected_version integer,expected_schema_version integer,basic_required jsonb,extra jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE current_version integer;new_fields jsonb;basic_keys text[];
BEGIN
  PERFORM pedpsy.require_mutable_design(study,expected_version);
  SELECT schema_version INTO current_version FROM pedpsy.study_passport_schemas WHERE study_id=study FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_AVAILABLE' USING ERRCODE='P0002';END IF;
  IF expected_schema_version IS NULL OR current_version<>expected_schema_version THEN RAISE EXCEPTION 'PASSPORT_SCHEMA_CONFLICT' USING ERRCODE='P0001';END IF;
  IF basic_required IS NULL OR jsonb_typeof(basic_required)<>'object' THEN RAISE EXCEPTION 'INVALID_PASSPORT_SCHEMA' USING ERRCODE='22023';END IF;
  SELECT array_agg(key ORDER BY key) INTO basic_keys FROM jsonb_object_keys(basic_required) key;
  IF basic_keys IS DISTINCT FROM ARRAY['city'] OR jsonb_typeof(basic_required->'city') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'INVALID_PASSPORT_SCHEMA' USING ERRCODE='22023';END IF;
  IF NOT pedpsy.passport_additional_valid(extra) THEN RAISE EXCEPTION 'INVALID_PASSPORT_SCHEMA' USING ERRCODE='22023';END IF;
  new_fields:=pedpsy.passport_basic_fields((basic_required->>'city')::boolean)||extra;
  IF EXISTS(SELECT 1 FROM pedpsy.passport_schema_versions WHERE study_id=study AND schema_version=current_version AND fields=new_fields) THEN
    PERFORM pedpsy.constructor_audit('studies.passport_schema.configure',study);RETURN pedpsy.passport_schema_snapshot(study);
  END IF;
  IF current_version>=100 THEN RAISE EXCEPTION 'DESIGN_LIMIT' USING ERRCODE='54000';END IF;
  INSERT INTO pedpsy.passport_schema_versions(study_id,schema_version,fields) VALUES(study,current_version+1,new_fields);
  UPDATE pedpsy.study_passport_schemas SET schema_version=current_version+1 WHERE study_id=study;
  PERFORM pedpsy.finish_study_design(study,'studies.passport_schema.configure');RETURN pedpsy.passport_schema_snapshot(study);
END $$;
ALTER TABLE passport_schema_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_passport_schemas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON passport_schema_versions,study_passport_schemas FROM PUBLIC;
REVOKE ALL ON FUNCTION passport_basic_fields(boolean),passport_additional_valid(jsonb),passport_fields_valid(jsonb),guard_passport_schema_version(),guard_passport_schema_pointer(),initialize_passport_schema(),passport_schema_snapshot(uuid),read_passport_schema(uuid),configure_passport_schema(uuid,integer,integer,jsonb,jsonb) FROM PUBLIC;
