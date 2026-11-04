SET LOCAL search_path=pedpsy,pg_catalog;
-- 055: accept any labelled numeric answer scale (1..N) in addition to the A/B pair.
-- Additive only: the exact option array is still pinned by the release form digest, so
-- this widens which *shapes* may be stored, not which texts. Approved by the owner.
CREATE FUNCTION pinned_numeric_options(options jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE
SET search_path=pg_catalog,pg_temp AS $$
SELECT jsonb_typeof(options)='array' AND jsonb_array_length(options) BETWEEN 2 AND 20
  AND NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(options) WITH ORDINALITY AS e(option,ordinal)
    WHERE (e.option->>'value') IS DISTINCT FROM e.ordinal::text
       OR jsonb_typeof(e.option->'text') IS DISTINCT FROM 'string'
       OR btrim(coalesce(e.option->>'text',''))=''
  )
$$;

ALTER TABLE release_items DROP CONSTRAINT IF EXISTS release_item_pinned_choices;
ALTER TABLE release_items ADD CONSTRAINT release_item_pinned_choices CHECK (COALESCE((
  (jsonb_typeof(options)='array' AND jsonb_array_length(options)=2
   AND (options->0->>'value')='A' AND (options->1->>'value')='B'
   AND jsonb_typeof(options->0->'text')='string' AND jsonb_typeof(options->1->'text')='string')
  OR pedpsy.pinned_numeric_options(options)
), false));
REVOKE ALL ON FUNCTION pinned_numeric_options(jsonb) FROM PUBLIC;
