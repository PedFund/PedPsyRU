SET LOCAL search_path=pedpsy,pg_catalog;
-- 142: a single generic, data-only release class for admin-authored numeric methods.
-- No arbitrary code; handler is fixed and every release carries its declarative key.
ALTER TABLE pedpsy.instrument_releases ADD COLUMN IF NOT EXISTS authoring_definition jsonb;

CREATE OR REPLACE FUNCTION pedpsy.authoring_release_allowed(release uuid) RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
  SELECT EXISTS(SELECT 1 FROM pedpsy.instrument_releases r
    WHERE r.id=release AND r.handler_version='authoring-numeric-1.0.0'
      AND r.method_id LIKE 'authoring\_%' ESCAPE '\'
      AND r.verification_state='key_verified' AND r.publication_state='draft'
      AND r.authoring_definition IS NOT NULL)
$$;

DO $$
BEGIN
  IF to_regprocedure('pedpsy.constructor_release_allowed_approved(uuid)') IS NULL THEN
    ALTER FUNCTION pedpsy.constructor_release_allowed(uuid) RENAME TO constructor_release_allowed_approved;
  END IF;
END $$;
CREATE OR REPLACE FUNCTION pedpsy.constructor_release_allowed(release uuid) RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
  SELECT pedpsy.constructor_release_allowed_approved(release)
      OR pedpsy.authoring_release_allowed(release)
$$;
REVOKE ALL ON FUNCTION pedpsy.constructor_release_allowed(uuid) FROM PUBLIC;
CREATE OR REPLACE FUNCTION pedpsy.lock_authoring() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE a record;at_ms bigint;
BEGIN
  PERFORM pg_advisory_xact_lock(5151980035);
  PERFORM pedpsy.lock_staff_identity();
  SELECT * INTO a FROM pedpsy.account_actor();
  at_ms:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
  IF a.credential_id IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE='28000';END IF;
  IF a.actor_role NOT IN ('administrator','superadministrator') THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';END IF;
  IF at_ms>=a.expires_at_ms THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE='28000';END IF;
  IF a.mfa_verified_at_ms IS NULL OR a.mfa_verified_at_ms>at_ms OR at_ms-a.mfa_verified_at_ms>=300000 THEN RAISE EXCEPTION 'MFA_RECHECK_REQUIRED' USING ERRCODE='42501';END IF;
END $$;

CREATE OR REPLACE FUNCTION pedpsy.publish_authoring_method(payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE
  release uuid:=gen_random_uuid(); form jsonb; items jsonb; key jsonb; pkg text; method_id text; package_version text;
  target_method_version text; handler text:='authoring-numeric-1.0.0'; title text; authors jsonb; indicators jsonb;
  form_id text; form_version text; form_digest text; key_digest text; package_digest text; item jsonb; n integer:=0;
BEGIN
  PERFORM pedpsy.lock_authoring();
  IF payload IS NULL OR jsonb_typeof(payload)<>'object' THEN RAISE EXCEPTION 'INVALID_METHOD_PACKAGE' USING ERRCODE='22023';END IF;
  method_id:=payload->>'method_id';package_version:=payload->>'package_version';target_method_version:=payload->>'method_version_id';
  title:=payload->>'title';authors:=payload->'authors';indicators:=payload->'indicators';form:=payload->'form_snapshot';key:=payload->'key';
  pkg:=payload->>'package_json';form_id:=form->>'id';form_version:=form->>'version';
  form_digest:=payload->>'form_digest';key_digest:=payload->>'key_digest';package_digest:=payload->>'package_digest';
  IF method_id IS NULL OR method_id NOT LIKE 'authoring\_%' ESCAPE '\' OR method_id !~ '^authoring_[a-z][a-z0-9_]{1,63}$' THEN RAISE EXCEPTION 'INVALID_METHOD_PACKAGE' USING ERRCODE='22023';END IF;
  IF target_method_version IS DISTINCT FROM (method_id||'@'||package_version) OR package_version<>'1.0.0' THEN RAISE EXCEPTION 'INVALID_METHOD_PACKAGE' USING ERRCODE='22023';END IF;
  IF length(title)<1 OR length(title)>200 OR jsonb_typeof(authors)<>'array' OR jsonb_array_length(authors) NOT BETWEEN 1 AND 10
     OR jsonb_typeof(indicators)<>'array' OR jsonb_array_length(indicators) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'INVALID_METHOD_PACKAGE' USING ERRCODE='22023';END IF;
  IF form IS NULL OR jsonb_typeof(form->'items')<>'array' OR jsonb_array_length(form->'items') NOT BETWEEN 1 AND 30 THEN RAISE EXCEPTION 'INVALID_METHOD_PACKAGE' USING ERRCODE='22023';END IF;
  IF form_id IS NULL OR form_version IS NULL OR form_digest !~ '^sha256:[a-f0-9]{64}$' OR key_digest !~ '^sha256:[a-f0-9]{64}$' OR package_digest !~ '^[a-f0-9]{64}$' OR octet_length(pkg)>262144 THEN RAISE EXCEPTION 'INVALID_METHOD_PACKAGE' USING ERRCODE='22023';END IF;
  IF key IS NULL OR jsonb_typeof(key)<>'object' OR pkg IS NULL THEN RAISE EXCEPTION 'INVALID_METHOD_PACKAGE' USING ERRCODE='22023';END IF;
  IF EXISTS(SELECT 1 FROM pedpsy.instrument_releases r WHERE r.method_version_id=target_method_version OR (r.form_id,r.form_version)=(form->>'id',form->>'version')) THEN RAISE EXCEPTION 'METHOD_VERSION_CONFLICT' USING ERRCODE='P0001';END IF;

  INSERT INTO pedpsy.method_library_versions(method_id,package_version,revision,package_json,package_digest,evidence,created_at_ms)
  VALUES(method_id,package_version,1,pkg,package_digest,
    jsonb_build_object('handler',jsonb_build_object('state','pinned','method_version_id',target_method_version,'handler_version',handler,'key_digest',key_digest),'blockers','[]'::jsonb),
    floor(extract(epoch FROM clock_timestamp())*1000)::bigint);
  INSERT INTO pedpsy.method_library_heads(method_id,package_version,revision) VALUES(method_id,package_version,1);
  INSERT INTO pedpsy.instrument_releases(id,method_id,form_id,form_version,method_version_id,handler_version,contract_version,form_digest,key_digest,verification_state,publication_state,artifact_ref,form_snapshot,authoring_definition)
  VALUES(release,method_id,form_id,form_version,target_method_version,handler,'1.0',form_digest,key_digest,'key_verified','draft','authoring:'||method_id,form,key);
  INSERT INTO pedpsy.method_library_catalog(release_id,method_id,package_version,title,authors,indicators,search_terms)
  VALUES(release,method_id,package_version,title,authors,indicators,jsonb_build_array(title)||authors||indicators);
  FOR item IN SELECT value FROM jsonb_array_elements(form->'items') LOOP
    n:=n+1;
    IF item->>'id' IS DISTINCT FROM 'q'||lpad(n::text,GREATEST(2,length(n::text)),'0') THEN RAISE EXCEPTION 'INVALID_METHOD_PACKAGE' USING ERRCODE='22023';END IF;
    INSERT INTO pedpsy.release_items(release_id,item_id,ordinal,options) VALUES(release,item->>'id',n,item->'options');
  END LOOP;
  PERFORM pedpsy.record_account_check('methods.manage',true,'AUTHORING_PUBLISH');
  PERFORM pedpsy.touch_staff_identity();
  RETURN jsonb_build_object('release_id',release,'method_id',method_id,'method_version_id',target_method_version,'form_digest',form_digest,'key_digest',key_digest);
END $$;

REVOKE ALL ON FUNCTION pedpsy.authoring_release_allowed(uuid),pedpsy.lock_authoring(),pedpsy.publish_authoring_method(jsonb) FROM PUBLIC;

DO $$
DECLARE d text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO d FROM pg_constraint WHERE conname='instrument_release_pinned_identity' AND conrelid='pedpsy.instrument_releases'::regclass;
  IF d IS NULL THEN RAISE EXCEPTION 'RELEASE_CONSTRAINT_MISSING';END IF;
  IF d LIKE '%authoring-numeric-1.0.0%' THEN RETURN;END IF;
  EXECUTE 'ALTER TABLE pedpsy.instrument_releases DROP CONSTRAINT instrument_release_pinned_identity';
  EXECUTE format('ALTER TABLE pedpsy.instrument_releases ADD CONSTRAINT instrument_release_pinned_identity CHECK ((%s) OR (handler_version=''authoring-numeric-1.0.0'' AND method_id LIKE ''authoring\_%%'' ESCAPE ''\'' AND verification_state=''key_verified'' AND publication_state=''draft'' AND authoring_definition IS NOT NULL))',substr(d,8,length(d)-8));
END $$;

DO $$
DECLARE d text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO d FROM pg_constraint WHERE conname='result_pinned_payload' AND conrelid='pedpsy.attempt_results'::regclass;
  IF d IS NULL THEN RAISE EXCEPTION 'RESULT_CONSTRAINT_MISSING';END IF;
  IF d LIKE '%authoring-numeric-1.0.0%' THEN RETURN;END IF;
  EXECUTE 'ALTER TABLE pedpsy.attempt_results DROP CONSTRAINT result_pinned_payload';
  EXECUTE format('ALTER TABLE pedpsy.attempt_results ADD CONSTRAINT result_pinned_payload CHECK ((%s) OR (coalesce(payload->>''status''=''scored'' AND payload->>''contract_version''=contract_version AND payload->>''handler_version''=handler_version AND payload->''calculation''->>''key_digest''=key_digest,false) AND handler_version=''authoring-numeric-1.0.0''))',substr(d,8,length(d)-8));
END $$;
