SET LOCAL search_path=pedpsy,pg_catalog;
-- 112: allow stored results for the Genchi measurement. The pinned constraint keeps
-- every previously accepted identity and appends the measurement handler identity.
DO $$
DECLARE d text; inner_expr text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO d FROM pg_constraint
    WHERE conname='result_pinned_payload' AND conrelid='pedpsy.attempt_results'::regclass;
  IF d IS NULL THEN RAISE EXCEPTION 'RESULT_CONSTRAINT_MISSING';END IF;
  IF d LIKE '%genchi_breath_hold@1.0.0%' THEN RETURN;END IF;
  inner_expr:=substr(d,8,length(d)-8);
  EXECUTE 'ALTER TABLE pedpsy.attempt_results DROP CONSTRAINT result_pinned_payload';
  EXECUTE format('ALTER TABLE pedpsy.attempt_results ADD CONSTRAINT result_pinned_payload CHECK ((%s) OR (%s))',
    '(((payload->>''method_version_id'')=''genchi_breath_hold@1.0.0'') AND (handler_version=''genchi-measurement-1.0.0'') AND (key_digest=''sha256:6e13194be58fa794cbb286a4fc64ae9ddd66a81a8f942c3fbb251c0440916c3a''))',
    inner_expr);
END $$;
