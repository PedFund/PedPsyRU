SET LOCAL search_path=pedpsy,pg_catalog;
-- 149: owner-facing presentation correction for authored indicator labels.
-- The release, form and calculation key stay immutable; only the displayed
-- indicator labels are appended to the existing presentation-correction table.
CREATE OR REPLACE FUNCTION pedpsy.correct_authoring_indicators(target_method text, labels jsonb, reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE target uuid; catalog jsonb; item text; n integer:=0;
BEGIN
  PERFORM pedpsy.lock_authoring();
  IF target_method IS NULL OR target_method !~ '^authoring_[a-z][a-z0-9_]{1,63}$' THEN RAISE EXCEPTION 'INVALID_METHOD_PACKAGE' USING ERRCODE='22023';END IF;
  IF labels IS NULL OR jsonb_typeof(labels)<>'array' OR jsonb_array_length(labels) NOT BETWEEN 1 AND 30 THEN RAISE EXCEPTION 'INVALID_METHOD_PACKAGE' USING ERRCODE='22023';END IF;
  FOR item IN SELECT jsonb_array_elements_text(labels) LOOP
    IF length(btrim(item)) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'INVALID_METHOD_PACKAGE' USING ERRCODE='22023';END IF;
    n:=n+1;
  END LOOP;
  SELECT r.id INTO target FROM pedpsy.instrument_releases r WHERE r.method_id=target_method AND r.handler_version='authoring-numeric-1.0.0' ORDER BY r.id LIMIT 1;
  IF target IS NULL THEN RAISE EXCEPTION 'NOT_AVAILABLE' USING ERRCODE='P0002';END IF;
  SELECT indicators INTO catalog FROM pedpsy.method_library_catalog WHERE release_id=target;
  IF catalog IS NULL OR jsonb_array_length(catalog)<>n THEN RAISE EXCEPTION 'INVALID_METHOD_PACKAGE' USING ERRCODE='22023';END IF;
  INSERT INTO pedpsy.release_presentation_corrections(id,release_id,indicators,reason,created_at_ms)
    VALUES(gen_random_uuid(),target,labels,coalesce(nullif(btrim(reason),''),'owner_correction'),floor(extract(epoch FROM clock_timestamp())*1000)::bigint);
  PERFORM pedpsy.record_account_check('method_authoring.indicators.correct',true,'GLOBAL_SCOPE');
  RETURN jsonb_build_object('release_id',target,'method_id',target_method,'labels',labels);
END $$;
REVOKE ALL ON FUNCTION pedpsy.correct_authoring_indicators(text,jsonb,text) FROM PUBLIC;
