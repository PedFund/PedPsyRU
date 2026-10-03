SET LOCAL search_path=pedpsy,pg_catalog;
ALTER TABLE studies ADD COLUMN design_version integer NOT NULL DEFAULT 0 CHECK(design_version BETWEEN 0 AND 2147483646);
-- No direct runtime DML is granted. Fixed functions repeat current authority under locks.
CREATE FUNCTION lock_study_researcher() RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE a record;credential uuid;
BEGIN
  SELECT * INTO a FROM pedpsy.account_actor();
  IF NOT FOUND OR a.actor_role<>'researcher' THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE='28000';END IF;
  -- Serialize quota/design operations before taking user/session/study locks. Never upgrade a shared credential lock.
  PERFORM 1 FROM pedpsy.researcher_credentials WHERE id=a.credential_id FOR UPDATE;
  credential:=pedpsy.lock_researcher_identity();RETURN credential;
END $$;
CREATE FUNCTION study_design_snapshot(study uuid) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
  SELECT jsonb_build_object('id',s.id,'title',s.title,'status',s.status,'version',s.design_version,'dataset_kind',s.dataset_kind,
    'groups',coalesce((SELECT jsonb_agg(jsonb_build_object('id',g.id,'name',g.name,'kind',g.kind,'status',g.status) ORDER BY g.created_at,g.id) FROM pedpsy.research_groups g WHERE g.study_id=s.id),'[]'::jsonb),
    'stages',coalesce((SELECT jsonb_agg(jsonb_build_object('id',t.id,'code',t.code,'ordinal',t.ordinal,'status',t.status,'based_on_stage_id',t.based_on_stage_id) ORDER BY t.ordinal,t.id) FROM pedpsy.research_stages t WHERE t.study_id=s.id),'[]'::jsonb),
    'assignments',coalesce((SELECT jsonb_agg(jsonb_build_object('id',x.id,'group_id',x.group_id,'stage_id',x.stage_id,'release_id',x.release_id,'status',x.status) ORDER BY x.stage_id,x.group_id,x.id) FROM pedpsy.assignments x WHERE x.study_id=s.id),'[]'::jsonb))
  FROM pedpsy.studies s WHERE s.id=study AND s.dataset_kind='demo'
$$;
CREATE FUNCTION constructor_audit(action text,study uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE a record;
BEGIN
  SELECT * INTO a FROM pedpsy.account_actor();IF NOT FOUND THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE='28000';END IF;
  INSERT INTO pedpsy.access_audit_events(id,at_ms,credential_id,action,outcome,reason,actor_role,resource_id)
    VALUES(gen_random_uuid(),floor(extract(epoch FROM clock_timestamp())*1000)::bigint,a.credential_id,action,'allow','STUDY_DESIGN',
      CASE WHEN a.actor_role IN ('administrator','superadministrator') THEN a.actor_role ELSE NULL END,study);
  UPDATE pedpsy.researcher_sessions SET last_seen_at_ms=floor(extract(epoch FROM clock_timestamp())*1000)::bigint WHERE token_hash=current_setting('app.session_hash',true);
END $$;
CREATE FUNCTION create_study(study uuid,study_title text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE credential uuid;actor_user uuid;
BEGIN
  credential:=pedpsy.lock_study_researcher();SELECT user_id INTO actor_user FROM pedpsy.researcher_credentials WHERE id=credential;
  IF study_title IS NULL OR length(study_title)>200 OR length(trim(study_title))=0 OR study_title ~ '[[:cntrl:]]' THEN RAISE EXCEPTION 'INVALID_STUDY_INPUT' USING ERRCODE='22023';END IF;
  IF (SELECT count(*) FROM pedpsy.study_memberships WHERE user_id=actor_user AND role='researcher' AND status='active')>=500 THEN RAISE EXCEPTION 'DESIGN_LIMIT' USING ERRCODE='54000';END IF;
  INSERT INTO pedpsy.studies(id,title) VALUES(study,trim(study_title));
  INSERT INTO pedpsy.study_memberships(study_id,user_id,role) VALUES(study,actor_user,'researcher');
  PERFORM pedpsy.constructor_audit('studies.create',study);RETURN pedpsy.study_design_snapshot(study);
END $$;
CREATE FUNCTION lock_study_design(study uuid,write_design boolean,expected_version integer DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE a record;s record;
BEGIN
  SELECT * INTO a FROM pedpsy.account_actor();
  IF NOT FOUND THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE='28000';END IF;
  IF a.actor_role='researcher' THEN
    PERFORM pedpsy.lock_study_researcher();
  ELSE
    IF write_design THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';END IF;
    PERFORM pedpsy.lock_staff_operation('protocols.read');
  END IF;
  SELECT * INTO s FROM pedpsy.studies WHERE id=study AND dataset_kind='demo' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_AVAILABLE' USING ERRCODE='P0002';END IF;
  IF a.actor_role='researcher' THEN
    PERFORM 1 FROM pedpsy.study_memberships WHERE study_id=study AND user_id=a.user_id AND role='researcher' AND status='active' FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'NOT_AVAILABLE' USING ERRCODE='P0002';END IF;
  END IF;
  IF write_design AND (expected_version IS NULL OR expected_version<>s.design_version) THEN RAISE EXCEPTION 'DESIGN_CONFLICT' USING ERRCODE='P0001';END IF;
  IF write_design AND s.status<>'draft' THEN RAISE EXCEPTION 'DESIGN_FROZEN' USING ERRCODE='P0001';END IF;
END $$;
CREATE FUNCTION read_study_design(study uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE a record;
BEGIN
  PERFORM pedpsy.lock_study_design(study,false);SELECT * INTO a FROM pedpsy.account_actor();
  PERFORM pedpsy.constructor_audit('studies.read',study);
  IF a.actor_role<>'researcher' THEN PERFORM pedpsy.touch_staff_identity();END IF;
  RETURN pedpsy.study_design_snapshot(study);
END $$;
REVOKE ALL ON FUNCTION lock_study_researcher(),study_design_snapshot(uuid),constructor_audit(text,uuid),create_study(uuid,text),lock_study_design(uuid,boolean,integer),read_study_design(uuid) FROM PUBLIC;
