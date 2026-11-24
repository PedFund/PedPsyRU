SET LOCAL search_path=pedpsy,pg_catalog;
-- 131: education is a required basic passport field with a fixed answer scale.
-- It becomes part of a schema when the researcher selects "Образование".
-- Already pinned schema versions and completed passports are not rewritten.
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
        WHEN 'age' THEN '[{"key":"age","label":"Возраст","required":true,"kind":"integer","min":18,"max":99}]'::jsonb
        WHEN 'city' THEN '[{"key":"city","label":"Населенный пункт","required":false,"kind":"text","max_length":100}]'::jsonb
        WHEN 'organization' THEN '[{"key":"organization","label":"Организация","required":false,"kind":"text","max_length":200}]'::jsonb
        ELSE pedpsy.passport_education_field()
      END;
    END IF;
  END LOOP;
  RETURN result;
END $$;

REVOKE ALL ON FUNCTION pedpsy.passport_education_field() FROM PUBLIC;
