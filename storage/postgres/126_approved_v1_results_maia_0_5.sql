SET LOCAL search_path=pedpsy,pg_catalog;
-- 126: append the MAIA-R 1.0.1 result identity to the live result constraint.
-- Migration 112 already appended Genchi; rebuilding from a historical copy would
-- silently drop that pin, so extend the actual constraint instead.
DO $$
DECLARE d text; inner_expr text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO d FROM pg_constraint
    WHERE conname='result_pinned_payload' AND conrelid='pedpsy.attempt_results'::regclass;
  IF d IS NULL THEN RAISE EXCEPTION 'RESULT_CONSTRAINT_MISSING';END IF;
  IF d LIKE '%maia_r_32@1.0.1-staging%' THEN RETURN;END IF;
  inner_expr:=substr(d,8,length(d)-8);
  EXECUTE 'ALTER TABLE pedpsy.attempt_results DROP CONSTRAINT result_pinned_payload';
  EXECUTE format('ALTER TABLE pedpsy.attempt_results ADD CONSTRAINT result_pinned_payload CHECK ((%s) OR (((payload->>''method_version_id'')=%L) AND (handler_version=%L) AND (key_digest=%L)))',
    inner_expr,'maia_r_32@1.0.1-staging','approved-numeric-1.0.0','sha256:21d9e48b34a0535478b9ed38a24447825eb825150e4b4cbab296c5fb81cb3afa');
END $$;
