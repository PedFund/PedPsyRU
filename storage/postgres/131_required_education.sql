SET LOCAL search_path=pedpsy,pg_catalog;
-- 131: education is a required basic passport field with a fixed answer scale.
-- New and draft schemas use this definition; already pinned schema versions and
-- completed passports are intentionally untouched.
CREATE FUNCTION pedpsy.passport_education_field() RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
  SELECT jsonb_build_array(jsonb_build_object(
    'key','education','label','Уровень образования','required',true,'kind','single_choice',
    'options',jsonb_build_array(
      jsonb_build_object('value','basic_general','label','Основное общее (9 классов) или неполное среднее'),
      jsonb_build_object('value','secondary_general','label','Среднее общее (11 классов)'),
      jsonb_build_object('value','secondary_vocational','label','Среднее профессиональное (колледж, техникум, училище)'),
      jsonb_build_object('value','incomplete_higher','label','Неоконченное высшее (лица, не завершившие обучение)'),
      jsonb_build_object('value','student','label','Студент'),
      jsonb_build_object('value','higher','label','Высшее (бакалавриат, специалитет, магистратура)'),
      jsonb_build_object('value','degree','label','Учёная степень (кандидат наук, доктор наук)')
    )))
$$;

CREATE OR REPLACE FUNCTION pedpsy.passport_selected_basic_fields(selected jsonb) RETURNS jsonb
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
        ELSE pedpsy.passport_education_field()
      END;
    END IF;
  END LOOP;
  RETURN result;
END $$;

CREATE OR REPLACE FUNCTION pedpsy.passport_basic_fields(city_required boolean DEFAULT false) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
  SELECT '[{"key":"sex","label":"Пол","required":true,"kind":"single_choice","options":[{"value":"female","label":"Женский"},{"value":"male","label":"Мужской"}]},{"key":"age","label":"Возраст","required":true,"kind":"integer","min":18,"max":99}]'::jsonb
    ||jsonb_build_array(jsonb_build_object('key','city','label','Населенный пункт','required',city_required,'kind','text','max_length',100))
    ||pedpsy.passport_education_field()
$$;

-- Keep legacy three-field passport schemas valid after passport_basic_fields()
-- grows to four fields. The first three fields are still sex, age and city.
CREATE OR REPLACE FUNCTION pedpsy.passport_fields_valid(fields jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,pedpsy AS $$
DECLARE f jsonb;key text;selected jsonb:='[]'::jsonb;extra jsonb:='[]'::jsonb;in_extra boolean:=false;expected jsonb;basic jsonb;
BEGIN
  IF fields IS NULL OR jsonb_typeof(fields)<>'array' OR jsonb_array_length(fields)>10 THEN RETURN false;END IF;
  FOR f IN SELECT value FROM jsonb_array_elements(fields) LOOP key:=f->>'key';IF key IN ('sex','age','city','organization','education') THEN IF in_extra THEN RETURN false;END IF;selected:=selected||jsonb_build_array(key);ELSE in_extra:=true;extra:=extra||jsonb_build_array(f);END IF;END LOOP;
  BEGIN expected:=pedpsy.passport_selected_basic_fields(selected);EXCEPTION WHEN SQLSTATE '22023' THEN RETURN false;END;
  IF (fields=expected||extra OR fields=pedpsy.passport_legacy_selected_basic_fields(selected)||extra) AND pedpsy.passport_additional_valid(extra) THEN RETURN true;END IF;
  basic:=pedpsy.passport_basic_fields(false);
  IF jsonb_array_length(fields) BETWEEN 3 AND 8 AND jsonb_typeof(fields->2->'required')='boolean'
    AND (jsonb_build_array(fields->0,fields->1,fields->2)=jsonb_build_array(basic->0,basic->1,basic->2)
      OR jsonb_build_array(fields->0,fields->1,fields->2)=pedpsy.passport_legacy_basic_fields((fields->2->>'required')::boolean)) THEN
    SELECT coalesce(jsonb_agg(value ORDER BY ordinal),'[]'::jsonb) INTO extra FROM jsonb_array_elements(fields) WITH ORDINALITY a(value,ordinal) WHERE ordinal>3;RETURN pedpsy.passport_additional_valid(extra);
  END IF;RETURN false;
END $$;

