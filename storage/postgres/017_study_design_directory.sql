SET LOCAL search_path=pedpsy,pg_catalog;
ALTER FUNCTION study_design_snapshot(uuid) RENAME TO constructor_snapshot_unbounded;
CREATE FUNCTION study_design_snapshot(study uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE data jsonb;
BEGIN
  data:=pedpsy.constructor_snapshot_unbounded(study);
  IF octet_length(data::text)>4194304 THEN RAISE EXCEPTION 'DESIGN_LIMIT' USING ERRCODE='54000';END IF;
  RETURN data;
END $$;
CREATE FUNCTION staff_study_design_list() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE data jsonb;
BEGIN
  PERFORM pedpsy.lock_staff_operation('protocols.read');
  IF (SELECT count(*) FROM pedpsy.studies WHERE dataset_kind='demo')>500 THEN RAISE EXCEPTION 'DESIGN_LIMIT' USING ERRCODE='54000';END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',s.id,'title',s.title,'status',s.status,'version',s.design_version) ORDER BY s.created_at,s.id),'[]'::jsonb)
    INTO data FROM pedpsy.studies s WHERE dataset_kind='demo';
  IF octet_length(data::text)>4194304 THEN RAISE EXCEPTION 'DESIGN_LIMIT' USING ERRCODE='54000';END IF;
  PERFORM pedpsy.record_account_check('studies.read',true,'GLOBAL_SCOPE');PERFORM pedpsy.touch_staff_identity();RETURN data;
END $$;
REVOKE ALL ON FUNCTION staff_study_design_list() FROM PUBLIC;
REVOKE ALL ON FUNCTION constructor_snapshot_unbounded(uuid),study_design_snapshot(uuid) FROM PUBLIC;
