SET LOCAL search_path=pedpsy,pg_catalog;
-- 111: allowlist support for the Genchi measurement release. The release row itself is
-- imported by scripts/import-genchi-local.js (the same pattern as the other pinned
-- methods), so this migration only adjusts guards and functions.
CREATE OR REPLACE FUNCTION genchi_options(options jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,pedpsy AS $$
  SELECT jsonb_typeof(options)='array' AND jsonb_array_length(options) BETWEEN 2 AND 601
    AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(options) e
      WHERE jsonb_typeof(e->'value') IS DISTINCT FROM 'string' OR jsonb_typeof(e->'text') IS DISTINCT FROM 'string'
        OR ((e->>'value') !~ '^(0|[1-9][0-9]{0,2})$' AND (e->>'value') NOT IN ('male','female')))
$$;
DO $$
DECLARE d text; inner_expr text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO d FROM pg_constraint
    WHERE conname='release_item_pinned_choices' AND conrelid='pedpsy.release_items'::regclass;
  IF d IS NULL THEN RAISE EXCEPTION 'RELEASE_ITEM_CONSTRAINT_MISSING';END IF;
  IF d LIKE '%genchi_options%' THEN RETURN;END IF;
  inner_expr:=substr(d,8,length(d)-8);
  EXECUTE 'ALTER TABLE pedpsy.release_items DROP CONSTRAINT release_item_pinned_choices';
  EXECUTE format('ALTER TABLE pedpsy.release_items ADD CONSTRAINT release_item_pinned_choices CHECK (COALESCE((%s) OR pedpsy.genchi_options(options), false))', inner_expr);
END $$;
DO $$
DECLARE d text; inner_expr text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO d FROM pg_constraint
    WHERE conname='response_known_choice' AND conrelid='pedpsy.responses'::regclass;
  IF d IS NULL THEN RAISE EXCEPTION 'RESPONSE_CONSTRAINT_MISSING';END IF;
  IF d LIKE '%genchi_measurement_value%' OR d LIKE '%BETWEEN 0 AND 600%' THEN RETURN;END IF;
  inner_expr:=substr(d,8,length(d)-8);
  EXECUTE 'ALTER TABLE pedpsy.responses DROP CONSTRAINT response_known_choice';
  EXECUTE format('ALTER TABLE pedpsy.responses ADD CONSTRAINT response_known_choice CHECK (COALESCE((%s) OR ((value ~ ''^(0|[1-9][0-9]{0,2})$'' AND value::integer BETWEEN 0 AND 600) OR value IN (''male'',''female'')), false))', inner_expr);
END $$;
DO $$
DECLARE d text; inner_expr text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO d FROM pg_constraint
    WHERE conname='instrument_release_pinned_identity' AND conrelid='pedpsy.instrument_releases'::regclass;
  IF d IS NULL THEN RAISE EXCEPTION 'RELEASE_CONSTRAINT_MISSING';END IF;
  IF d LIKE '%genchi_breath_hold@1.0.0%' THEN RETURN;END IF;
  inner_expr:=substr(d,8,length(d)-8);
  EXECUTE 'ALTER TABLE pedpsy.instrument_releases DROP CONSTRAINT instrument_release_pinned_identity';
  EXECUTE format('ALTER TABLE pedpsy.instrument_releases ADD CONSTRAINT instrument_release_pinned_identity CHECK ((%s) OR (%s))', '((method_id=''genchi_breath_hold'') AND (method_version_id=''genchi_breath_hold@1.0.0'') AND (handler_version=''genchi-measurement-1.0.0'') AND (key_digest=''sha256:6e13194be58fa794cbb286a4fc64ae9ddd66a81a8f942c3fbb251c0440916c3a'') AND (verification_state=''key_verified'') AND (publication_state=''draft'') AND (form_id=''genchi_breath_hold_shared'') AND (form_version=''1.0.0'') AND (form_digest=''sha256:cbdfe5285e8560cf8a01b1f370339afda5c035591a2573331353fdb893836f5f''))', inner_expr);
END $$;
DO $$
DECLARE d text;
BEGIN
  SELECT pg_get_functiondef('pedpsy.guard_assignment()'::regprocedure) INTO d;
  IF d LIKE '%genchi_breath_hold%' THEN RETURN;END IF;
  d := replace(d,'ELSE 30 END', 'WHEN (SELECT method_id FROM pedpsy.instrument_releases WHERE id=NEW.release_id)=''genchi_breath_hold'' THEN 2 ELSE 30 END');
  EXECUTE d;
END $$;
DO $$
DECLARE d text;
BEGIN
  SELECT pg_get_functiondef('pedpsy.guard_attempt()'::regprocedure) INTO d;
  IF d LIKE '%genchi_breath_hold%' THEN RETURN;END IF;
  d := replace(d,'ELSE 30 END', 'WHEN (SELECT method_id FROM pedpsy.instrument_releases WHERE id=NEW.release_id)=''genchi_breath_hold'' THEN 2 ELSE 30 END');
  EXECUTE d;
END $$;
CREATE OR REPLACE FUNCTION genchi_release_allowed(release uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
  SELECT EXISTS(SELECT 1 FROM pedpsy.instrument_releases r WHERE r.id=release AND r.method_id='genchi_breath_hold'
    AND r.method_version_id='genchi_breath_hold@1.0.0' AND r.handler_version='genchi-measurement-1.0.0'
    AND r.form_digest='sha256:cbdfe5285e8560cf8a01b1f370339afda5c035591a2573331353fdb893836f5f' AND r.key_digest='sha256:6e13194be58fa794cbb286a4fc64ae9ddd66a81a8f942c3fbb251c0440916c3a'
    AND r.verification_state='key_verified' AND r.publication_state='draft'
    AND (SELECT count(*) FROM pedpsy.release_items i WHERE i.release_id=r.id)=2)
$$;
DO $$
DECLARE d text;
BEGIN
  SELECT pg_get_functiondef('pedpsy.constructor_release_allowed(uuid)'::regprocedure) INTO d;
  IF d LIKE '%constructor_release_allowed_base(%' THEN RETURN; END IF;
  d := replace(d,'FUNCTION pedpsy.constructor_release_allowed(release uuid)','FUNCTION pedpsy.constructor_release_allowed_base(release uuid)');
  EXECUTE d;
END $$;
CREATE OR REPLACE FUNCTION constructor_release_allowed(release uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
  SELECT pedpsy.genchi_release_allowed(release) OR pedpsy.constructor_release_allowed_base(release)
$$;
REVOKE ALL ON FUNCTION genchi_options(jsonb),genchi_release_allowed(uuid) FROM PUBLIC;
DO $$
BEGIN
  IF to_regprocedure('pedpsy.constructor_release_allowed_base(uuid)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION pedpsy.constructor_release_allowed_base(uuid) FROM PUBLIC';
  END IF;
END $$;
DO $$
DECLARE d text; inner_expr text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO d FROM pg_constraint
    WHERE conname='instrument_release_pinned_identity' AND conrelid='pedpsy.instrument_releases'::regclass;
  IF d IS NULL THEN RAISE EXCEPTION 'RELEASE_CONSTRAINT_MISSING';END IF;
  IF d LIKE '%genchi_breath_hold@1.0.0%' THEN RETURN;END IF;
  inner_expr:=substr(d,8,length(d)-8);
  EXECUTE 'ALTER TABLE pedpsy.instrument_releases DROP CONSTRAINT instrument_release_pinned_identity';
  EXECUTE format('ALTER TABLE pedpsy.instrument_releases ADD CONSTRAINT instrument_release_pinned_identity CHECK ((%s) OR (%s))', '((method_id=''genchi_breath_hold'') AND (method_version_id=''genchi_breath_hold@1.0.0'') AND (handler_version=''genchi-measurement-1.0.0'') AND (key_digest=''sha256:6e13194be58fa794cbb286a4fc64ae9ddd66a81a8f942c3fbb251c0440916c3a'') AND (verification_state=''key_verified'') AND (publication_state=''draft'') AND (form_id=''genchi_breath_hold_shared'') AND (form_version=''1.0.0'') AND (form_digest=''sha256:cbdfe5285e8560cf8a01b1f370339afda5c035591a2573331353fdb893836f5f''))', inner_expr);
END $$;
DO $$
DECLARE d text;
BEGIN
  SELECT pg_get_functiondef('pedpsy.guard_assignment()'::regprocedure) INTO d;
  IF d LIKE '%genchi_breath_hold%' THEN RETURN;END IF;
  d := replace(d,'ELSE 30 END', 'WHEN (SELECT method_id FROM pedpsy.instrument_releases WHERE id=NEW.release_id)=''genchi_breath_hold'' THEN 2 ELSE 30 END');
  EXECUTE d;
END $$;
DO $$
DECLARE d text;
BEGIN
  SELECT pg_get_functiondef('pedpsy.guard_attempt()'::regprocedure) INTO d;
  IF d LIKE '%genchi_breath_hold%' THEN RETURN;END IF;
  d := replace(d,'ELSE 30 END', 'WHEN (SELECT method_id FROM pedpsy.instrument_releases WHERE id=NEW.release_id)=''genchi_breath_hold'' THEN 2 ELSE 30 END');
  EXECUTE d;
END $$;
CREATE OR REPLACE FUNCTION genchi_release_allowed(release uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
  SELECT EXISTS(SELECT 1 FROM pedpsy.instrument_releases r WHERE r.id=release AND r.method_id='genchi_breath_hold'
    AND r.method_version_id='genchi_breath_hold@1.0.0' AND r.handler_version='genchi-measurement-1.0.0'
    AND r.form_digest='sha256:cbdfe5285e8560cf8a01b1f370339afda5c035591a2573331353fdb893836f5f' AND r.key_digest='sha256:6e13194be58fa794cbb286a4fc64ae9ddd66a81a8f942c3fbb251c0440916c3a'
    AND r.verification_state='key_verified' AND r.publication_state='draft'
    AND (SELECT count(*) FROM pedpsy.release_items i WHERE i.release_id=r.id)=2)
$$;
DO $$
DECLARE d text;
BEGIN
  SELECT pg_get_functiondef('pedpsy.constructor_release_allowed(uuid)'::regprocedure) INTO d;
  IF d LIKE '%constructor_release_allowed_base(%' THEN RETURN; END IF;
  d := replace(d,'FUNCTION pedpsy.constructor_release_allowed(release uuid)','FUNCTION pedpsy.constructor_release_allowed_base(release uuid)');
  EXECUTE d;
END $$;
CREATE OR REPLACE FUNCTION constructor_release_allowed(release uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
  SELECT pedpsy.genchi_release_allowed(release) OR pedpsy.constructor_release_allowed_base(release)
$$;
REVOKE ALL ON FUNCTION genchi_options(jsonb),genchi_release_allowed(uuid) FROM PUBLIC;
DO $$
BEGIN
  IF to_regprocedure('pedpsy.constructor_release_allowed_base(uuid)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION pedpsy.constructor_release_allowed_base(uuid) FROM PUBLIC';
  END IF;
END $$;
