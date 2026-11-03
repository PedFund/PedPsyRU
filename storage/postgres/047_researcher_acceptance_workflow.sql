SET LOCAL search_path=pedpsy,pg_catalog;

-- New studies start usable. Existing studies are deliberately not backfilled.
CREATE OR REPLACE FUNCTION create_study(study uuid,study_title text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE credential uuid;actor_user uuid;
BEGIN
  credential:=pedpsy.lock_study_researcher();SELECT user_id INTO actor_user FROM pedpsy.researcher_credentials WHERE id=credential;
  IF study_title IS NULL OR length(study_title)>200 OR length(trim(study_title))=0 OR study_title ~ '[[:cntrl:]]' THEN RAISE EXCEPTION 'INVALID_STUDY_INPUT' USING ERRCODE='22023';END IF;
  IF (SELECT count(*) FROM pedpsy.study_memberships WHERE user_id=actor_user AND role='researcher' AND status='active')>=500 THEN RAISE EXCEPTION 'DESIGN_LIMIT' USING ERRCODE='54000';END IF;
  INSERT INTO pedpsy.studies(id,title) VALUES(study,trim(study_title));
  INSERT INTO pedpsy.study_memberships(study_id,user_id,role) VALUES(study,actor_user,'researcher');
  INSERT INTO pedpsy.research_groups(id,study_id,name,kind) VALUES(gen_random_uuid(),study,'Экспериментальная','experimental');
  INSERT INTO pedpsy.research_stages(id,study_id,code,ordinal) VALUES(gen_random_uuid(),study,'T0',0);
  PERFORM pedpsy.constructor_audit('studies.create',study);RETURN pedpsy.study_design_snapshot(study);
END $$;

CREATE OR REPLACE FUNCTION create_study_for_researcher(study uuid,owner_credential uuid,study_title text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE owner_user uuid;
BEGIN
  PERFORM pedpsy.lock_staff_operation('studies.configure');
  SELECT user_id INTO owner_user FROM pedpsy.researcher_credentials WHERE id=owner_credential AND status='active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_AVAILABLE' USING ERRCODE='P0002';END IF;
  PERFORM 1 FROM pedpsy.users WHERE id=owner_user AND status='active' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_AVAILABLE' USING ERRCODE='P0002';END IF;
  IF study_title IS NULL OR length(study_title)>200 OR length(trim(study_title))=0 OR study_title ~ '[[:cntrl:]]' THEN RAISE EXCEPTION 'INVALID_STUDY_INPUT' USING ERRCODE='22023';END IF;
  IF (SELECT count(*) FROM pedpsy.study_memberships WHERE user_id=owner_user AND role='researcher' AND status='active')>=500 THEN RAISE EXCEPTION 'DESIGN_LIMIT' USING ERRCODE='54000';END IF;
  INSERT INTO pedpsy.studies(id,title) VALUES(study,trim(study_title));
  INSERT INTO pedpsy.study_memberships(study_id,user_id,role) VALUES(study,owner_user,'researcher');
  INSERT INTO pedpsy.research_groups(id,study_id,name,kind) VALUES(gen_random_uuid(),study,'Экспериментальная','experimental');
  INSERT INTO pedpsy.research_stages(id,study_id,code,ordinal) VALUES(gen_random_uuid(),study,'T0',0);
  PERFORM pedpsy.constructor_audit('studies.create',study);RETURN pedpsy.study_design_snapshot(study);
END $$;

-- Keep historical immutable schemas valid while new schemas use adult bounds
-- and the broader participant-facing locality label.
CREATE FUNCTION passport_legacy_basic_fields(city_required boolean DEFAULT false) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
  SELECT '[{"key":"sex","label":"Пол","required":true,"kind":"single_choice","options":[{"value":"female","label":"Женский"},{"value":"male","label":"Мужской"}]},{"key":"age","label":"Возраст","required":true,"kind":"integer","min":0,"max":130}]'::jsonb
    ||jsonb_build_array(jsonb_build_object('key','city','label','Город','required',city_required,'kind','text','max_length',100))
$$;
CREATE OR REPLACE FUNCTION passport_basic_fields(city_required boolean DEFAULT false) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
  SELECT '[{"key":"sex","label":"Пол","required":true,"kind":"single_choice","options":[{"value":"female","label":"Женский"},{"value":"male","label":"Мужской"}]},{"key":"age","label":"Возраст","required":true,"kind":"integer","min":18,"max":99}]'::jsonb
    ||jsonb_build_array(jsonb_build_object('key','city','label','Населенный пункт','required',city_required,'kind','text','max_length',100))
$$;

CREATE FUNCTION passport_legacy_selected_basic_fields(selected jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE key text;result jsonb:='[]'::jsonb;seen text[]:=ARRAY[]::text[];
BEGIN
  IF selected IS NULL OR jsonb_typeof(selected)<>'array' OR jsonb_array_length(selected)>5 THEN RAISE EXCEPTION 'INVALID_PASSPORT_SCHEMA' USING ERRCODE='22023';END IF;
  FOR key IN SELECT value FROM jsonb_array_elements_text(selected) LOOP
    IF key NOT IN ('sex','age','city','organization','education') OR key=ANY(seen) THEN RAISE EXCEPTION 'INVALID_PASSPORT_SCHEMA' USING ERRCODE='22023';END IF;
    seen:=array_append(seen,key);
  END LOOP;
  FOREACH key IN ARRAY ARRAY['sex','age','city','organization','education'] LOOP IF key=ANY(seen) THEN result:=result||CASE key
    WHEN 'sex' THEN '[{"key":"sex","label":"Пол","required":true,"kind":"single_choice","options":[{"value":"female","label":"Женский"},{"value":"male","label":"Мужской"}]}]'::jsonb
    WHEN 'age' THEN '[{"key":"age","label":"Возраст","required":true,"kind":"integer","min":0,"max":130}]'::jsonb
    WHEN 'city' THEN '[{"key":"city","label":"Город","required":false,"kind":"text","max_length":100}]'::jsonb
    WHEN 'organization' THEN '[{"key":"organization","label":"Организация","required":false,"kind":"text","max_length":200}]'::jsonb
    ELSE '[{"key":"education","label":"Образование","required":false,"kind":"text","max_length":200}]'::jsonb END;END IF;END LOOP;
  RETURN result;
END $$;

CREATE OR REPLACE FUNCTION passport_selected_basic_fields(selected jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE key text;result jsonb:='[]'::jsonb;seen text[]:=ARRAY[]::text[];
BEGIN
  IF selected IS NULL OR jsonb_typeof(selected)<>'array' OR jsonb_array_length(selected)>5 THEN RAISE EXCEPTION 'INVALID_PASSPORT_SCHEMA' USING ERRCODE='22023';END IF;
  FOR key IN SELECT value FROM jsonb_array_elements_text(selected) LOOP
    IF key NOT IN ('sex','age','city','organization','education') OR key=ANY(seen) THEN RAISE EXCEPTION 'INVALID_PASSPORT_SCHEMA' USING ERRCODE='22023';END IF;
    seen:=array_append(seen,key);
  END LOOP;
  FOREACH key IN ARRAY ARRAY['sex','age','city','organization','education'] LOOP IF key=ANY(seen) THEN result:=result||CASE key
    WHEN 'sex' THEN '[{"key":"sex","label":"Пол","required":true,"kind":"single_choice","options":[{"value":"female","label":"Женский"},{"value":"male","label":"Мужской"}]}]'::jsonb
    WHEN 'age' THEN '[{"key":"age","label":"Возраст","required":true,"kind":"integer","min":18,"max":99}]'::jsonb
    WHEN 'city' THEN '[{"key":"city","label":"Населенный пункт","required":false,"kind":"text","max_length":100}]'::jsonb
    WHEN 'organization' THEN '[{"key":"organization","label":"Организация","required":false,"kind":"text","max_length":200}]'::jsonb
    ELSE '[{"key":"education","label":"Образование","required":false,"kind":"text","max_length":200}]'::jsonb END;END IF;END LOOP;
  RETURN result;
END $$;

CREATE OR REPLACE FUNCTION passport_additional_valid(fields jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE f jsonb;o jsonb;keys text[];seen text[]:=ARRAY[]::text[];choices text[];choice_labels text[];expected text[];
BEGIN
  IF fields IS NULL OR jsonb_typeof(fields)<>'array' OR jsonb_array_length(fields)>5 THEN RETURN false;END IF;
  FOR f IN SELECT value FROM jsonb_array_elements(fields) LOOP
    IF jsonb_typeof(f)<>'object' THEN RETURN false;END IF;SELECT array_agg(key ORDER BY key) INTO keys FROM jsonb_object_keys(f) key;
    IF f->>'kind'='text' THEN expected:=ARRAY['key','kind','label','max_length','required'];ELSIF f->>'kind'='integer' THEN expected:=ARRAY['key','kind','label','max','min','required'];ELSIF f->>'kind'='single_choice' THEN expected:=ARRAY['key','kind','label','options','required'];ELSE RETURN false;END IF;
    IF keys IS DISTINCT FROM expected OR jsonb_typeof(f->'key')<>'string' OR f->>'key' !~ '^extra_[a-z][a-z0-9_]{0,31}$' OR f->>'key'=ANY(seen) OR jsonb_typeof(f->'required')<>'boolean' OR jsonb_typeof(f->'label')<>'string' OR length(f->>'label') NOT BETWEEN 1 AND 120 OR btrim(f->>'label')='' OR f->>'label'<>btrim(f->>'label') OR f->>'label' ~ '[[:cntrl:]]' THEN RETURN false;END IF;
    seen:=array_append(seen,f->>'key');
    IF f->>'kind'='text' THEN IF jsonb_typeof(f->'max_length')<>'number' OR f->>'max_length' !~ '^[0-9]{1,3}$' OR (f->>'max_length')::integer NOT BETWEEN 1 AND 500 THEN RETURN false;END IF;
    ELSIF f->>'kind'='integer' THEN IF jsonb_typeof(f->'min')<>'number' OR jsonb_typeof(f->'max')<>'number' OR f->>'min' !~ '^-?[0-9]{1,7}$' OR f->>'max' !~ '^-?[0-9]{1,7}$' OR (f->>'min')::integer NOT BETWEEN -1000000 AND 1000000 OR (f->>'max')::integer NOT BETWEEN -1000000 AND 1000000 OR (f->>'min')::integer>(f->>'max')::integer THEN RETURN false;END IF;
    ELSE
      IF jsonb_typeof(f->'options')<>'array' OR jsonb_array_length(f->'options') NOT BETWEEN 1 AND 20 THEN RETURN false;END IF;choices:=ARRAY[]::text[];choice_labels:=ARRAY[]::text[];
      FOR o IN SELECT value FROM jsonb_array_elements(f->'options') LOOP
        IF jsonb_typeof(o)<>'object' THEN RETURN false;END IF;SELECT array_agg(key ORDER BY key) INTO keys FROM jsonb_object_keys(o) key;
        IF keys IS DISTINCT FROM ARRAY['label','value'] OR jsonb_typeof(o->'value')<>'string' OR o->>'value' !~ '^[a-z][a-z0-9_]{0,39}$' OR o->>'value'=ANY(choices) OR jsonb_typeof(o->'label')<>'string' OR length(o->>'label') NOT BETWEEN 1 AND 80 OR btrim(o->>'label')='' OR o->>'label'<>btrim(o->>'label') OR o->>'label' ~ '[[:cntrl:]]' OR lower(o->>'label')=ANY(choice_labels) THEN RETURN false;END IF;
        choices:=array_append(choices,o->>'value');choice_labels:=array_append(choice_labels,lower(o->>'label'));
      END LOOP;
    END IF;
  END LOOP;RETURN true;
END $$;

CREATE OR REPLACE FUNCTION passport_fields_valid(fields jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,pedpsy AS $$
DECLARE f jsonb;key text;selected jsonb:='[]'::jsonb;extra jsonb:='[]'::jsonb;in_extra boolean:=false;expected jsonb;
BEGIN
  IF fields IS NULL OR jsonb_typeof(fields)<>'array' OR jsonb_array_length(fields)>10 THEN RETURN false;END IF;
  FOR f IN SELECT value FROM jsonb_array_elements(fields) LOOP key:=f->>'key';IF key IN ('sex','age','city','organization','education') THEN IF in_extra THEN RETURN false;END IF;selected:=selected||jsonb_build_array(key);ELSE in_extra:=true;extra:=extra||jsonb_build_array(f);END IF;END LOOP;
  BEGIN expected:=pedpsy.passport_selected_basic_fields(selected);EXCEPTION WHEN SQLSTATE '22023' THEN RETURN false;END;
  IF (fields=expected||extra OR fields=pedpsy.passport_legacy_selected_basic_fields(selected)||extra) AND pedpsy.passport_additional_valid(extra) THEN RETURN true;END IF;
  IF jsonb_array_length(fields) BETWEEN 3 AND 8 AND jsonb_typeof(fields->2->'required')='boolean' AND (jsonb_build_array(fields->0,fields->1,fields->2)=pedpsy.passport_basic_fields((fields->2->>'required')::boolean) OR jsonb_build_array(fields->0,fields->1,fields->2)=pedpsy.passport_legacy_basic_fields((fields->2->>'required')::boolean)) THEN
    SELECT coalesce(jsonb_agg(value ORDER BY ordinal),'[]'::jsonb) INTO extra FROM jsonb_array_elements(fields) WITH ORDINALITY a(value,ordinal) WHERE ordinal>3;RETURN pedpsy.passport_additional_valid(extra);
  END IF;RETURN false;
END $$;

ALTER FUNCTION change_research_workbench(uuid,integer,text,jsonb) RENAME TO change_research_workbench_v2;
CREATE FUNCTION change_research_workbench(study uuid,expected integer,action text,input jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE target uuid;source uuid;next_ordinal integer;stage_code text;stage_note text;
BEGIN
  IF action NOT IN ('stage','copy_assignments') THEN RETURN pedpsy.change_research_workbench_v2(study,expected,action,input);END IF;
  PERFORM pedpsy.lock_research_workbench(study,expected);PERFORM pedpsy.require_mutable_design(study,expected);
  IF input IS NULL OR jsonb_typeof(input)<>'object' THEN RAISE EXCEPTION 'INVALID_STUDY_INPUT' USING ERRCODE='22023';END IF;
  IF action='stage' THEN
    stage_note:=coalesce(input->>'note','');IF length(stage_note)>500 OR stage_note ~ '[[:cntrl:]]' THEN RAISE EXCEPTION 'INVALID_STUDY_INPUT' USING ERRCODE='22023';END IF;
    IF input->>'id' IS NULL THEN
      SELECT id,ordinal INTO source,next_ordinal FROM pedpsy.research_stages WHERE study_id=study AND status='active' ORDER BY ordinal DESC,id DESC LIMIT 1;
      next_ordinal:=coalesce(next_ordinal+1,0);IF next_ordinal>=50 THEN RAISE EXCEPTION 'DESIGN_LIMIT' USING ERRCODE='54000';END IF;stage_code:='T'||next_ordinal;target:=gen_random_uuid();
      IF source IS NULL THEN PERFORM pedpsy.configure_study_stage(study,expected,target,stage_code,next_ordinal,true);ELSE PERFORM pedpsy.copy_study_stage(study,expected,source,target,stage_code,next_ordinal);END IF;
    ELSE
      target:=(input->>'id')::uuid;SELECT code,ordinal INTO stage_code,next_ordinal FROM pedpsy.research_stages WHERE study_id=study AND id=target AND status='active';IF NOT FOUND THEN RAISE EXCEPTION 'NOT_AVAILABLE' USING ERRCODE='P0002';END IF;
      PERFORM pedpsy.configure_study_stage(study,expected,target,stage_code,next_ordinal,false);
    END IF;
    INSERT INTO pedpsy.research_stage_notes VALUES(study,target,trim(stage_note)) ON CONFLICT(study_id,stage_id) DO UPDATE SET note=excluded.note;
    PERFORM pedpsy.constructor_audit('studies.workbench.configure',study);RETURN pedpsy.research_workbench_snapshot(study);
  END IF;
  target:=(input->>'stage_id')::uuid;SELECT p.id INTO source FROM pedpsy.research_stages t JOIN LATERAL (SELECT id FROM pedpsy.research_stages WHERE study_id=study AND status='active' AND ordinal<t.ordinal ORDER BY ordinal DESC,id DESC LIMIT 1) p ON true WHERE t.study_id=study AND t.id=target AND t.status='active';
  IF source IS NULL THEN RAISE EXCEPTION 'NOT_AVAILABLE' USING ERRCODE='P0002';END IF;
  DELETE FROM pedpsy.assignments WHERE study_id=study AND stage_id=target;
  INSERT INTO pedpsy.assignments(id,study_id,group_id,stage_id,release_id) SELECT gen_random_uuid(),study,a.group_id,target,a.release_id FROM pedpsy.assignments a JOIN pedpsy.research_groups g ON (g.study_id,g.id)=(a.study_id,a.group_id) AND g.status='active' WHERE a.study_id=study AND a.stage_id=source AND a.status='active';
  PERFORM pedpsy.finish_study_design(study,'studies.assignments.copy');PERFORM pedpsy.constructor_audit('studies.workbench.configure',study);RETURN pedpsy.research_workbench_snapshot(study);
END $$;

REVOKE ALL ON FUNCTION passport_legacy_basic_fields(boolean),passport_legacy_selected_basic_fields(jsonb),change_research_workbench_v2(uuid,integer,text,jsonb),change_research_workbench(uuid,integer,text,jsonb) FROM PUBLIC;
