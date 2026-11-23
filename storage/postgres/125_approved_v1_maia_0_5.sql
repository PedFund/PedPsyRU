SET LOCAL search_path=pedpsy,pg_catalog;
-- 125: allowlist the reconciled MAIA-R 1.0.1 release without rebuilding the
-- existing allowlist. Migration 111 already wrapped constructor_release_allowed
-- around genchi_release_allowed and constructor_release_allowed_base; keep both.
CREATE OR REPLACE FUNCTION maia_release_allowed(release uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
  SELECT EXISTS(SELECT 1 FROM pedpsy.instrument_releases r WHERE r.id=release AND r.method_id='maia_r_32'
    AND r.form_id='maia_r_32_shared' AND r.form_version='1.0.0' AND r.method_version_id='maia_r_32@1.0.1-staging'
    AND r.handler_version='approved-numeric-1.0.0' AND r.contract_version='1.0'
    AND r.verification_state='legacy_checked' AND r.publication_state='draft'
    AND r.form_digest='sha256:21d653bf3a8a467855139fadaedaa2dc281105ded4eac53e09597b337d8885f6'
    AND r.key_digest='sha256:21d9e48b34a0535478b9ed38a24447825eb825150e4b4cbab296c5fb81cb3afa'
    AND (SELECT count(*) FROM pedpsy.release_items i WHERE i.release_id=r.id)=32
    AND NOT EXISTS(SELECT 1 FROM pedpsy.release_items i WHERE i.release_id=r.id
      AND (i.ordinal>32 OR i.options IS DISTINCT FROM r.form_snapshot->'items'->(i.ordinal-1)->'options')))
$$;
CREATE OR REPLACE FUNCTION constructor_release_allowed(release uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
  SELECT pedpsy.genchi_release_allowed(release) OR pedpsy.maia_release_allowed(release) OR pedpsy.constructor_release_allowed_base(release)
$$;
REVOKE ALL ON FUNCTION maia_release_allowed(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION constructor_release_allowed(uuid),constructor_release_allowed_base(uuid) FROM PUBLIC;

-- Append the MAIA identity to the live constraint instead of replacing it with a
-- historical copy. This preserves the Genchi identity and every earlier pin.
DO $$
DECLARE d text; inner_expr text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO d FROM pg_constraint
    WHERE conname='instrument_release_pinned_identity' AND conrelid='pedpsy.instrument_releases'::regclass;
  IF d IS NULL THEN RAISE EXCEPTION 'RELEASE_CONSTRAINT_MISSING';END IF;
  IF d LIKE '%maia_r_32@1.0.1-staging%' THEN RETURN;END IF;
  inner_expr:=substr(d,8,length(d)-8);
  EXECUTE 'ALTER TABLE pedpsy.instrument_releases DROP CONSTRAINT instrument_release_pinned_identity';
  EXECUTE format('ALTER TABLE pedpsy.instrument_releases ADD CONSTRAINT instrument_release_pinned_identity CHECK ((%s) OR ((method_id=''maia_r_32'') AND (method_version_id=''maia_r_32@1.0.1-staging'') AND (handler_version=''approved-numeric-1.0.0'') AND (key_digest=''sha256:21d9e48b34a0535478b9ed38a24447825eb825150e4b4cbab296c5fb81cb3afa'') AND (verification_state=''legacy_checked'') AND (publication_state=''draft'') AND (form_id=''maia_r_32_shared'') AND (form_version=''1.0.0'') AND (form_digest=''sha256:21d653bf3a8a467855139fadaedaa2dc281105ded4eac53e09597b337d8885f6'')))', inner_expr);
END $$;
