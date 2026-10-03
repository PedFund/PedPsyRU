SET LOCAL search_path=pedpsy,pg_catalog;
-- Count and bounded metadata must use the same MVCC snapshot. A separate
-- count before aggregation could race with creation by another researcher.
CREATE OR REPLACE FUNCTION staff_study_design_list() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE data jsonb;row_count integer;
BEGIN
  PERFORM pedpsy.lock_staff_operation('protocols.read');
  SELECT count(*)::integer,coalesce(jsonb_agg(jsonb_build_object('id',s.id,'title',s.title,'status',s.status,'version',s.design_version) ORDER BY s.created_at,s.id),'[]'::jsonb)
    INTO row_count,data FROM (SELECT id,title,status,design_version,created_at FROM pedpsy.studies WHERE dataset_kind='demo' ORDER BY created_at,id LIMIT 501) s;
  IF row_count>500 OR octet_length(data::text)>4194304 THEN RAISE EXCEPTION 'DESIGN_LIMIT' USING ERRCODE='54000';END IF;
  PERFORM pedpsy.record_account_check('studies.read',true,'GLOBAL_SCOPE');PERFORM pedpsy.touch_staff_identity();RETURN data;
END $$;
REVOKE ALL ON FUNCTION staff_study_design_list() FROM PUBLIC;
