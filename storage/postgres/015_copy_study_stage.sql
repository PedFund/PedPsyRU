SET LOCAL search_path=pedpsy,pg_catalog;
CREATE FUNCTION copy_study_stage(study uuid,expected_version integer,source_stage uuid,new_stage uuid,new_code text,new_ordinal integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE source_order integer;
BEGIN
  PERFORM pedpsy.require_mutable_design(study,expected_version);
  SELECT ordinal INTO source_order FROM pedpsy.research_stages WHERE study_id=study AND id=source_stage AND status='active';
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_AVAILABLE' USING ERRCODE='P0002';END IF;
  IF new_code IS NULL OR length(trim(new_code))=0 OR length(new_code)>40 OR new_code ~ '[[:cntrl:]]'
    OR new_ordinal IS NULL OR new_ordinal<=source_order OR new_ordinal>9999 THEN RAISE EXCEPTION 'INVALID_STUDY_INPUT' USING ERRCODE='22023';END IF;
  IF EXISTS(SELECT 1 FROM pedpsy.research_stages WHERE study_id=study AND (lower(trim(code))=lower(trim(new_code)) OR ordinal=new_ordinal)) THEN RAISE EXCEPTION 'DESIGN_DUPLICATE' USING ERRCODE='P0001';END IF;
  IF (SELECT count(*) FROM pedpsy.research_stages WHERE study_id=study)>=50 THEN RAISE EXCEPTION 'DESIGN_LIMIT' USING ERRCODE='54000';END IF;
  IF EXISTS(SELECT 1 FROM pedpsy.assignments WHERE study_id=study AND stage_id=source_stage AND status='active' AND NOT pedpsy.constructor_release_allowed(release_id)) THEN RAISE EXCEPTION 'NOT_AVAILABLE' USING ERRCODE='P0002';END IF;
  INSERT INTO pedpsy.research_stages(id,study_id,code,ordinal,based_on_stage_id) VALUES(new_stage,study,trim(new_code),new_ordinal,source_stage);
  -- Only configuration. No diagnostic or enrollment tables are inserted/read/copied here.
  INSERT INTO pedpsy.assignments(id,study_id,group_id,stage_id,release_id)
    SELECT gen_random_uuid(),study,a.group_id,new_stage,a.release_id FROM pedpsy.assignments a
      JOIN pedpsy.research_groups g ON g.id=a.group_id AND g.study_id=a.study_id AND g.status='active'
      WHERE a.study_id=study AND a.stage_id=source_stage AND a.status='active';
  RETURN pedpsy.finish_study_design(study,'studies.stage_copy');
END $$;
REVOKE ALL ON FUNCTION copy_study_stage(uuid,integer,uuid,uuid,text,integer) FROM PUBLIC;
