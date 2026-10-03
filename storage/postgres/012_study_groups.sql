SET LOCAL search_path=pedpsy,pg_catalog;
CREATE UNIQUE INDEX groups_unique_name ON research_groups(study_id,lower(trim(name)));
CREATE FUNCTION require_mutable_design(study uuid,expected_version integer) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
BEGIN
  PERFORM pedpsy.lock_study_design(study,true,expected_version);
  IF EXISTS(SELECT 1 FROM pedpsy.attempts WHERE study_id=study) THEN RAISE EXCEPTION 'DESIGN_FROZEN' USING ERRCODE='P0001';END IF;
END $$;
CREATE FUNCTION finish_study_design(study uuid,action text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
BEGIN
  IF (SELECT design_version FROM pedpsy.studies WHERE id=study)>=2147483646 THEN RAISE EXCEPTION 'DESIGN_LIMIT' USING ERRCODE='54000';END IF;
  UPDATE pedpsy.studies SET design_version=design_version+1,updated_at=clock_timestamp() WHERE id=study;
  PERFORM pedpsy.constructor_audit(action,study);RETURN pedpsy.study_design_snapshot(study);
END $$;
CREATE FUNCTION configure_study_group(study uuid,expected_version integer,target_group uuid,group_name text,group_kind text,create_new boolean) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
BEGIN
  PERFORM pedpsy.require_mutable_design(study,expected_version);
  IF group_name IS NULL OR length(trim(group_name))=0 OR length(group_name)>100 OR group_name ~ '[[:cntrl:]]'
    OR group_kind IS NULL OR group_kind NOT IN ('control','experimental','other') OR create_new IS NULL THEN RAISE EXCEPTION 'INVALID_STUDY_INPUT' USING ERRCODE='22023';END IF;
  IF NOT create_new AND NOT EXISTS(SELECT 1 FROM pedpsy.research_groups WHERE id=target_group AND study_id=study) THEN RAISE EXCEPTION 'NOT_AVAILABLE' USING ERRCODE='P0002';END IF;
  IF EXISTS(SELECT 1 FROM pedpsy.research_groups WHERE study_id=study AND lower(trim(name))=lower(trim(group_name)) AND id<>target_group) THEN RAISE EXCEPTION 'DESIGN_DUPLICATE' USING ERRCODE='P0001';END IF;
  IF create_new THEN
    IF (SELECT count(*) FROM pedpsy.research_groups WHERE study_id=study)>=50 THEN RAISE EXCEPTION 'DESIGN_LIMIT' USING ERRCODE='54000';END IF;
    INSERT INTO pedpsy.research_groups(id,study_id,name,kind) VALUES(target_group,study,trim(group_name),group_kind);
  ELSE UPDATE pedpsy.research_groups SET name=trim(group_name),kind=group_kind,updated_at=clock_timestamp() WHERE id=target_group AND study_id=study;END IF;
  RETURN pedpsy.finish_study_design(study,'studies.groups');
END $$;
REVOKE ALL ON FUNCTION require_mutable_design(uuid,integer),finish_study_design(uuid,text),configure_study_group(uuid,integer,uuid,text,text,boolean) FROM PUBLIC;
