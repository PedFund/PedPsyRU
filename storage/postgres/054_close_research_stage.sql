SET LOCAL search_path=pedpsy,pg_catalog;
-- 054: remove an accidentally created stage from an editable design.
-- The model already has a stage status, so "delete" is an archival close: the stage
-- stops participating in activation, keeps its history and cannot break assignments,
-- enrollments or attempts by a physical DELETE.
CREATE FUNCTION close_research_stage(study uuid,expected integer,stage uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE s record;
BEGIN
  PERFORM pedpsy.require_mutable_design(study,expected);
  SELECT code,ordinal,status INTO s FROM pedpsy.research_stages WHERE id=stage AND study_id=study FOR UPDATE;
  IF NOT FOUND OR s.status<>'active' THEN RAISE EXCEPTION 'NOT_AVAILABLE' USING ERRCODE='P0002';END IF;
  -- The first stage is the base for copying later stages and stays.
  IF s.ordinal=0 THEN RAISE EXCEPTION 'STAGE_BASE_FROZEN' USING ERRCODE='23514';END IF;
  IF EXISTS(SELECT 1 FROM pedpsy.attempts WHERE study_id=study AND stage_id=stage)
    OR EXISTS(SELECT 1 FROM pedpsy.stage_enrollments WHERE study_id=study AND stage_id=stage)
    THEN RAISE EXCEPTION 'STAGE_IN_USE' USING ERRCODE='23514';END IF;
  DELETE FROM pedpsy.assignments WHERE study_id=study AND stage_id=stage;
  UPDATE pedpsy.research_stages SET status='closed',updated_at=clock_timestamp() WHERE id=stage AND study_id=study;
  PERFORM pedpsy.finish_study_design(study,'studies.stages.close');
  PERFORM pedpsy.constructor_audit('studies.stages.close',study);
  RETURN pedpsy.research_workbench_snapshot(study);
END $$;
REVOKE ALL ON FUNCTION close_research_stage(uuid,integer,uuid) FROM PUBLIC;
