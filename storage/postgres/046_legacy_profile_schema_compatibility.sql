SET LOCAL search_path=pedpsy,pg_catalog;
-- Migration 045 made the participant profile field set selectable. Keep the
-- existing passport-schema endpoint compatible with its stricter legacy
-- contract, where Пол/Возраст/Город are always present and Город may be
-- required. Both shapes remain canonical; arbitrary system-field metadata is
-- still rejected.
CREATE OR REPLACE FUNCTION passport_fields_valid(fields jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,pedpsy AS $$
DECLARE
  f jsonb;key text;selected jsonb:='[]'::jsonb;extra jsonb:='[]'::jsonb;
  in_extra boolean:=false;expected jsonb;
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
  IF fields=expected||extra AND pedpsy.passport_additional_valid(extra) THEN RETURN true;END IF;
  IF jsonb_array_length(fields) BETWEEN 3 AND 8
    AND jsonb_typeof(fields->2->'required')='boolean'
    AND jsonb_build_array(fields->0,fields->1,fields->2)=pedpsy.passport_basic_fields((fields->2->>'required')::boolean) THEN
    SELECT coalesce(jsonb_agg(value ORDER BY ordinal),'[]'::jsonb) INTO extra
      FROM jsonb_array_elements(fields) WITH ORDINALITY a(value,ordinal) WHERE ordinal>3;
    RETURN pedpsy.passport_additional_valid(extra);
  END IF;
  RETURN false;
END $$;
REVOKE ALL ON FUNCTION passport_fields_valid(jsonb) FROM PUBLIC;
