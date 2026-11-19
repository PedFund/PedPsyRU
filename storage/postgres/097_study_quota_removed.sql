SET LOCAL search_path=pedpsy,pg_catalog;
-- 097: the owner removed the active-study limit. Both activation paths stay the same
-- except that the quota counter is no longer read; the column remains for compatibility.
CREATE OR REPLACE FUNCTION change_study_lifecycle(study uuid,expected_version integer,new_status text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE credential uuid;a record;s record;
BEGIN
  credential:=pedpsy.lock_study_researcher();PERFORM pedpsy.lock_study_design(study,false);
  SELECT * INTO a FROM pedpsy.account_actor();SELECT * INTO s FROM pedpsy.studies WHERE id=study;
  IF new_status IS NULL OR new_status NOT IN ('active','closed') THEN RAISE EXCEPTION 'INVALID_STUDY_INPUT' USING ERRCODE='22023';END IF;
  IF expected_version IS NULL OR expected_version<>s.design_version THEN RAISE EXCEPTION 'DESIGN_CONFLICT' USING ERRCODE='P0001';END IF;
  IF new_status=s.status THEN PERFORM pedpsy.constructor_audit('studies.lifecycle',study);RETURN pedpsy.study_design_snapshot(study);END IF;
  IF s.status='closed' OR new_status='active' AND s.status<>'draft' THEN RAISE EXCEPTION 'DESIGN_FROZEN' USING ERRCODE='P0001';END IF;
  IF new_status='active' THEN
    -- Current constructor has one owner. Shared ownership/quota changes require their own future workflow.
    IF (SELECT count(*) FROM pedpsy.study_memberships WHERE study_id=study AND role='researcher' AND status='active')<>1
      OR EXISTS(SELECT 1 FROM pedpsy.attempts WHERE study_id=study) THEN RAISE EXCEPTION 'DESIGN_FROZEN' USING ERRCODE='P0001';END IF;
    IF NOT EXISTS(SELECT 1 FROM pedpsy.research_groups WHERE study_id=study AND status='active')
      OR NOT EXISTS(SELECT 1 FROM pedpsy.research_stages WHERE study_id=study AND status='active')
      OR EXISTS(SELECT 1 FROM pedpsy.research_groups g CROSS JOIN pedpsy.research_stages t WHERE g.study_id=study AND t.study_id=study AND g.status='active' AND t.status='active'
        AND NOT EXISTS(SELECT 1 FROM pedpsy.assignments x WHERE x.study_id=study AND x.group_id=g.id AND x.stage_id=t.id AND x.status='active'))
      OR EXISTS(SELECT 1 FROM pedpsy.assignments WHERE study_id=study AND status='active' AND NOT pedpsy.constructor_release_allowed(release_id)) THEN RAISE EXCEPTION 'DESIGN_INCOMPLETE' USING ERRCODE='P0001';END IF;
  END IF;
  UPDATE pedpsy.studies SET status=new_status WHERE id=study;
  RETURN pedpsy.finish_study_design(study,'studies.lifecycle');
END $$;
CREATE OR REPLACE FUNCTION change_study_lifecycle(study uuid,expected_version integer,new_status text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE credential uuid;s record;
BEGIN
  credential:=pedpsy.lock_managed_study_owner(study);PERFORM pedpsy.lock_study_design(study,false);
  PERFORM pedpsy.require_managed_study_owner(study,credential);
  SELECT * INTO s FROM pedpsy.studies WHERE id=study;
  IF new_status IS NULL OR new_status NOT IN ('active','closed') THEN RAISE EXCEPTION 'INVALID_STUDY_INPUT' USING ERRCODE='22023';END IF;
  IF expected_version IS NULL OR expected_version<>s.design_version THEN RAISE EXCEPTION 'DESIGN_CONFLICT' USING ERRCODE='P0001';END IF;
  IF new_status=s.status THEN PERFORM pedpsy.constructor_audit('studies.lifecycle',study);RETURN pedpsy.study_design_snapshot(study);END IF;
  IF s.status='closed' OR new_status='active' AND s.status<>'draft' THEN RAISE EXCEPTION 'DESIGN_FROZEN' USING ERRCODE='P0001';END IF;
  IF new_status='active' THEN
    IF (SELECT count(*) FROM pedpsy.study_memberships WHERE study_id=study AND role='researcher' AND status='active')<>1
      OR EXISTS(SELECT 1 FROM pedpsy.attempts WHERE study_id=study) THEN RAISE EXCEPTION 'DESIGN_FROZEN' USING ERRCODE='P0001';END IF;
    IF NOT EXISTS(SELECT 1 FROM pedpsy.research_groups WHERE study_id=study AND status='active')
      OR NOT EXISTS(SELECT 1 FROM pedpsy.research_stages WHERE study_id=study AND status='active')
      OR EXISTS(SELECT 1 FROM pedpsy.research_groups g CROSS JOIN pedpsy.research_stages t WHERE g.study_id=study AND t.study_id=study AND g.status='active' AND t.status='active'
        AND NOT EXISTS(SELECT 1 FROM pedpsy.assignments x WHERE x.study_id=study AND x.group_id=g.id AND x.stage_id=t.id AND x.status='active'))
      OR EXISTS(SELECT 1 FROM pedpsy.assignments WHERE study_id=study AND status='active' AND NOT pedpsy.constructor_release_allowed(release_id)) THEN RAISE EXCEPTION 'DESIGN_INCOMPLETE' USING ERRCODE='P0001';END IF;
  END IF;
  UPDATE pedpsy.studies SET status=new_status WHERE id=study;RETURN pedpsy.finish_study_design(study,'studies.lifecycle');
END $$;
