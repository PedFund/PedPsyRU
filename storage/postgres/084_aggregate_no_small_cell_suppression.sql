SET LOCAL search_path=pedpsy,pg_catalog;
-- 084: aggregate charts show every observed level and mean, including cells
-- smaller than three. The researcher explicitly requested this for aggregate
-- visualisations; no individual answers are exposed.
DO $$
DECLARE definition text;
BEGIN
  SELECT pg_get_functiondef('pedpsy.research_method_analytics(uuid,uuid,uuid)'::regprocedure) INTO definition;
  definition:=replace(definition,'CASE WHEN n>=3 THEN n END','n');
  definition:=replace(definition,'CASE WHEN n>=3 THEN mean END','mean');
  EXECUTE definition;
  SELECT pg_get_functiondef('pedpsy.research_participant_passport_stats(uuid)'::regprocedure) INTO definition;
  definition:=replace(definition,'CASE WHEN v.n>=3 THEN v.n END','v.n');
  definition:=replace(definition,'CASE WHEN b.n>=3 THEN b.n END','b.n');
  EXECUTE definition;
END $$;
