SET LOCAL search_path=pedpsy,pg_catalog;
-- 123: allow a labelled numeric answer scale to start at 0 as well as at 1.
-- MAIA-R's reconciled passport defines answer codes 0..5. The option array is still
-- pinned by the release form digest; this only widens the accepted shape.
CREATE OR REPLACE FUNCTION pinned_numeric_options(options jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE
SET search_path=pg_catalog,pg_temp AS $$
SELECT jsonb_typeof(options)='array' AND jsonb_array_length(options) BETWEEN 2 AND 20
  AND (
    NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(options) WITH ORDINALITY AS e(option,ordinal)
      WHERE (e.option->>'value') IS DISTINCT FROM e.ordinal::text
         OR jsonb_typeof(e.option->'text') IS DISTINCT FROM 'string'
         OR btrim(coalesce(e.option->>'text',''))=''
    )
    OR NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(options) WITH ORDINALITY AS e(option,ordinal)
      WHERE (e.option->>'value') IS DISTINCT FROM (e.ordinal-1)::text
         OR jsonb_typeof(e.option->'text') IS DISTINCT FROM 'string'
         OR btrim(coalesce(e.option->>'text',''))=''
    )
  )
$$;
REVOKE ALL ON FUNCTION pinned_numeric_options(jsonb) FROM PUBLIC;
