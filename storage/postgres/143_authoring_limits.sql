SET LOCAL search_path=pedpsy,pg_catalog;
-- 143: authoring limits: up to 30 indicators, 10 answer options, 150 questions.
DO $$
DECLARE d text;
BEGIN
  SELECT pg_get_functiondef('pedpsy.publish_authoring_method(jsonb)'::regprocedure) INTO d;
  IF d IS NULL THEN RAISE EXCEPTION 'AUTHORING_PUBLISH_MISSING';END IF;
  IF d NOT LIKE '%BETWEEN 1 AND 150%' THEN
    d:=replace(d,'BETWEEN 1 AND 30','BETWEEN 1 AND 150');
    EXECUTE d;
  END IF;
END $$;
DO $$
DECLARE d text;
BEGIN
  SELECT pg_get_functiondef('pedpsy.guard_assignment()'::regprocedure) INTO d;
  IF d IS NULL THEN RAISE EXCEPTION 'ASSIGNMENT_GUARD_MISSING';END IF;
  IF d NOT LIKE '%authoring\_%' THEN
    d:=replace(d,'''genchi_breath_hold'' THEN 2 ELSE 30 END','''genchi_breath_hold'' THEN 2 WHEN (SELECT method_id FROM pedpsy.instrument_releases WHERE id=NEW.release_id) LIKE ''authoring\_%'' ESCAPE ''\'' THEN 150 ELSE 30 END');
    EXECUTE d;
  END IF;
END $$;
DO $$
DECLARE d text;
BEGIN
  SELECT pg_get_functiondef('pedpsy.guard_attempt()'::regprocedure) INTO d;
  IF d IS NULL THEN RAISE EXCEPTION 'ATTEMPT_GUARD_MISSING';END IF;
  IF d NOT LIKE '%authoring\_%' THEN
    d:=replace(d,'''genchi_breath_hold'' THEN 2 ELSE 30 END','''genchi_breath_hold'' THEN 2 WHEN (SELECT method_id FROM pedpsy.instrument_releases WHERE id=NEW.release_id) LIKE ''authoring\_%'' ESCAPE ''\'' THEN 150 ELSE 30 END');
    EXECUTE d;
  END IF;
END $$;
