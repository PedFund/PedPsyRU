SET LOCAL search_path=pedpsy,pg_catalog;
-- 082: normalize the age bucket labels in the already deployed statistics
-- function. The original literals were stored double-encoded; ASCII ranges
-- avoid any client-encoding dependency for fresh and existing databases.
DO $$
DECLARE definition text;
BEGIN
  SELECT pg_get_functiondef('pedpsy.research_participant_passport_stats(uuid)'::regprocedure) INTO definition;
  definition:=regexp_replace(definition,'''18[^'']*24''','''18-24''','g');
  definition:=regexp_replace(definition,'''25[^'']*34''','''25-34''','g');
  definition:=regexp_replace(definition,'''35[^'']*44''','''35-44''','g');
  definition:=regexp_replace(definition,'''45[^'']*54''','''45-54''','g');
  EXECUTE definition;
END $$;
