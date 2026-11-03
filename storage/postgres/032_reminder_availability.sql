SET LOCAL search_path=pedpsy,pg_catalog;
-- A participant cannot act on an unopened or excluded stage. Keep reminders
-- subject to the same availability, even if a stale client offers the button.
ALTER FUNCTION change_research_workbench(uuid,integer,text,jsonb) RENAME TO change_research_workbench_v1;
CREATE FUNCTION change_research_workbench(study uuid,expected integer,action text,input jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
BEGIN
  IF expected IS NULL OR expected<0 THEN RAISE EXCEPTION 'INVALID_STUDY_INPUT' USING ERRCODE='22023';END IF;
  PERFORM pedpsy.lock_research_workbench(study,expected);
  IF action='remind' AND NOT EXISTS(SELECT 1 FROM pedpsy.group_stage_access WHERE study_id=study AND group_id=(input->>'group_id')::uuid AND stage_id=(input->>'stage_id')::uuid) THEN RAISE EXCEPTION 'NOT_AVAILABLE' USING ERRCODE='P0002';END IF;
  RETURN pedpsy.change_research_workbench_v1(study,expected,action,input);
END $$;
REVOKE ALL ON FUNCTION change_research_workbench_v1(uuid,integer,text,jsonb),change_research_workbench(uuid,integer,text,jsonb) FROM PUBLIC;
ALTER FUNCTION research_progress_rows(uuid) RENAME TO research_progress_rows_v1;
CREATE FUNCTION research_progress_rows(study uuid) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
 SELECT coalesce(jsonb_agg(x),'[]'::jsonb) FROM jsonb_array_elements(pedpsy.research_progress_rows_v1(study)) x
 WHERE NOT EXISTS(SELECT 1 FROM pedpsy.stage_enrollments e WHERE e.study_id=study AND e.participant_id=(x->>'participant_id')::uuid AND e.stage_id=(x->>'stage_id')::uuid AND e.status<>'active')
$$;
ALTER FUNCTION research_progress(uuid) RENAME TO research_progress_v1;
CREATE FUNCTION research_progress(study uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE data jsonb;
BEGIN
  data:=pedpsy.research_progress_v1(study);
  RETURN data||jsonb_build_object('openings',coalesce((SELECT jsonb_agg(jsonb_build_object('group_id',group_id,'stage_id',stage_id)) FROM pedpsy.group_stage_access WHERE study_id=study),'[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION research_progress_rows_v1(uuid),research_progress_rows(uuid),research_progress_v1(uuid),research_progress(uuid) FROM PUBLIC;
