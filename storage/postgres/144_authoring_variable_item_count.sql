SET LOCAL search_path=pedpsy,pg_catalog;
-- 144: authoring releases have a variable item count (1..150), not a fixed 150.
DO $$
DECLARE d text;
BEGIN
  SELECT pg_get_functiondef('pedpsy.guard_assignment()'::regprocedure) INTO d;
  IF d IS NULL THEN RAISE EXCEPTION 'ASSIGNMENT_GUARD_MISSING';END IF;
  IF d LIKE '%THEN 150 ELSE 30 END%' THEN
    d:=replace(d,'THEN 150 ELSE 30 END','THEN (SELECT count(*) FROM pedpsy.release_items WHERE release_id=NEW.release_id) ELSE 30 END');
    EXECUTE d;
  END IF;
END $$;
DO $$
DECLARE d text;
BEGIN
  SELECT pg_get_functiondef('pedpsy.guard_attempt()'::regprocedure) INTO d;
  IF d IS NULL THEN RAISE EXCEPTION 'ATTEMPT_GUARD_MISSING';END IF;
  IF d LIKE '%THEN 150 ELSE 30 END%' THEN
    d:=replace(d,'THEN 150 ELSE 30 END','THEN (SELECT count(*) FROM pedpsy.release_items WHERE release_id=NEW.release_id) ELSE 30 END');
    EXECUTE d;
  END IF;
END $$;
