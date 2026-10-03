SET LOCAL search_path=pedpsy,pg_catalog;
CREATE FUNCTION change_study_lifecycle(study uuid,expected_version integer,new_status text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE credential uuid;a record;s record;quota integer;
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
    SELECT active_study_quota INTO quota FROM pedpsy.researcher_credentials WHERE id=credential;
    IF (SELECT count(DISTINCT r.id) FROM pedpsy.studies r JOIN pedpsy.study_memberships m ON m.study_id=r.id
      WHERE m.user_id=a.user_id AND m.role='researcher' AND m.status='active' AND r.status='active')>=quota THEN RAISE EXCEPTION 'STUDY_QUOTA' USING ERRCODE='P0001';END IF;
    IF NOT EXISTS(SELECT 1 FROM pedpsy.research_groups WHERE study_id=study AND status='active')
      OR NOT EXISTS(SELECT 1 FROM pedpsy.research_stages WHERE study_id=study AND status='active')
      OR EXISTS(SELECT 1 FROM pedpsy.research_groups g CROSS JOIN pedpsy.research_stages t WHERE g.study_id=study AND t.study_id=study AND g.status='active' AND t.status='active'
        AND NOT EXISTS(SELECT 1 FROM pedpsy.assignments x WHERE x.study_id=study AND x.group_id=g.id AND x.stage_id=t.id AND x.status='active'))
      OR EXISTS(SELECT 1 FROM pedpsy.assignments WHERE study_id=study AND status='active' AND NOT pedpsy.constructor_release_allowed(release_id)) THEN RAISE EXCEPTION 'DESIGN_INCOMPLETE' USING ERRCODE='P0001';END IF;
  END IF;
  UPDATE pedpsy.studies SET status=new_status WHERE id=study;
  RETURN pedpsy.finish_study_design(study,'studies.lifecycle');
END $$;
CREATE FUNCTION rename_study(study uuid,expected_version integer,new_title text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
BEGIN
  PERFORM pedpsy.require_mutable_design(study,expected_version);
  IF new_title IS NULL OR length(trim(new_title))=0 OR length(new_title)>200 OR new_title ~ '[[:cntrl:]]' THEN RAISE EXCEPTION 'INVALID_STUDY_INPUT' USING ERRCODE='22023';END IF;
  UPDATE pedpsy.studies SET title=trim(new_title) WHERE id=study;
  RETURN pedpsy.finish_study_design(study,'studies.title');
END $$;
REVOKE ALL ON FUNCTION change_study_lifecycle(uuid,integer,text),rename_study(uuid,integer,text) FROM PUBLIC;
