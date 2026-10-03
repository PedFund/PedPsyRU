SET LOCAL search_path=pedpsy,pg_catalog;
CREATE UNIQUE INDEX stages_unique_code ON research_stages(study_id,lower(trim(code)));
CREATE FUNCTION configure_study_stage(study uuid,expected_version integer,target_stage uuid,stage_code text,stage_ordinal integer,create_new boolean) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
BEGIN
  PERFORM pedpsy.require_mutable_design(study,expected_version);
  IF stage_code IS NULL OR length(trim(stage_code))=0 OR length(stage_code)>40 OR stage_code ~ '[[:cntrl:]]'
    OR stage_ordinal IS NULL OR stage_ordinal<0 OR stage_ordinal>9999 OR create_new IS NULL THEN RAISE EXCEPTION 'INVALID_STUDY_INPUT' USING ERRCODE='22023';END IF;
  IF NOT create_new AND NOT EXISTS(SELECT 1 FROM pedpsy.research_stages WHERE id=target_stage AND study_id=study) THEN RAISE EXCEPTION 'NOT_AVAILABLE' USING ERRCODE='P0002';END IF;
  IF EXISTS(SELECT 1 FROM pedpsy.research_stages WHERE study_id=study AND (lower(trim(code))=lower(trim(stage_code)) OR ordinal=stage_ordinal) AND id<>target_stage) THEN RAISE EXCEPTION 'DESIGN_DUPLICATE' USING ERRCODE='P0001';END IF;
  IF EXISTS(SELECT 1 FROM pedpsy.research_stages child JOIN pedpsy.research_stages parent ON parent.id=child.based_on_stage_id AND parent.study_id=child.study_id
    WHERE child.study_id=study AND (child.id=target_stage AND parent.ordinal>=stage_ordinal OR parent.id=target_stage AND child.ordinal<=stage_ordinal)) THEN RAISE EXCEPTION 'INVALID_STUDY_INPUT' USING ERRCODE='22023';END IF;
  IF create_new THEN
    IF (SELECT count(*) FROM pedpsy.research_stages WHERE study_id=study)>=50 THEN RAISE EXCEPTION 'DESIGN_LIMIT' USING ERRCODE='54000';END IF;
    INSERT INTO pedpsy.research_stages(id,study_id,code,ordinal) VALUES(target_stage,study,trim(stage_code),stage_ordinal);
  ELSE UPDATE pedpsy.research_stages SET code=trim(stage_code),ordinal=stage_ordinal,updated_at=clock_timestamp() WHERE id=target_stage AND study_id=study;END IF;
  RETURN pedpsy.finish_study_design(study,'studies.stages');
END $$;
REVOKE ALL ON FUNCTION configure_study_stage(uuid,integer,uuid,text,integer,boolean) FROM PUBLIC;
