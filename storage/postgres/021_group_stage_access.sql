SET LOCAL search_path=pedpsy,pg_catalog;
-- Opening is separate from immutable design. Absence means NOT OPEN for the
-- new registration/enrollment path. Existing legacy synthetic attempts survive.
CREATE TABLE group_stage_access (
  id uuid PRIMARY KEY,study_id uuid NOT NULL,group_id uuid NOT NULL,stage_id uuid NOT NULL,
  revision integer NOT NULL DEFAULT 1 CHECK(revision=1),
  opened_at_ms bigint NOT NULL CHECK(opened_at_ms BETWEEN 0 AND 9007199254740991),
  opened_by_researcher uuid REFERENCES researcher_credentials(id),opened_by_staff uuid REFERENCES staff_credentials(id),
  CHECK((opened_by_researcher IS NOT NULL)::integer+(opened_by_staff IS NOT NULL)::integer=1),
  UNIQUE(study_id,group_id,stage_id),
  FOREIGN KEY(study_id,group_id) REFERENCES research_groups(study_id,id),
  FOREIGN KEY(study_id,stage_id) REFERENCES research_stages(study_id,id)
);
CREATE INDEX group_stage_access_stage ON group_stage_access(study_id,stage_id);
CREATE INDEX group_stage_access_researcher ON group_stage_access(opened_by_researcher) WHERE opened_by_researcher IS NOT NULL;
CREATE INDEX group_stage_access_staff ON group_stage_access(opened_by_staff) WHERE opened_by_staff IS NOT NULL;
ALTER TABLE group_stage_access ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON group_stage_access FROM PUBLIC;
CREATE FUNCTION guard_group_stage_access() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,pedpsy AS $$
BEGIN RAISE EXCEPTION 'stage opening history frozen' USING ERRCODE='23514';END $$;
CREATE TRIGGER group_stage_access_guard BEFORE UPDATE OR DELETE ON group_stage_access FOR EACH ROW EXECUTE FUNCTION guard_group_stage_access();
CREATE FUNCTION stage_access_audit(operation text,study uuid,target uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE a record;at_ms bigint;
BEGIN
  SELECT * INTO a FROM pedpsy.account_actor();IF NOT FOUND THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE='28000';END IF;
  at_ms:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
  INSERT INTO pedpsy.access_audit_events(id,at_ms,credential_id,study_id,action,outcome,reason,actor_role,resource_id)
    VALUES(gen_random_uuid(),at_ms,a.credential_id,study,operation,'allow','STAGE_ACCESS',
      CASE WHEN a.actor_role='researcher' THEN NULL ELSE a.actor_role END,target);
  IF a.actor_role='researcher' THEN UPDATE pedpsy.researcher_sessions SET last_seen_at_ms=at_ms WHERE token_hash=current_setting('app.session_hash',true);
  ELSE PERFORM pedpsy.touch_staff_identity();END IF;
END $$;
CREATE FUNCTION group_stage_access_record(study uuid,target_group uuid,target_stage uuid) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
  SELECT jsonb_build_object('id',a.id,'study_id',t.study_id,'group_id',target_group,'stage_id',t.id,
    'status',CASE WHEN a.id IS NULL THEN 'not_open' ELSE 'open' END,'revision',coalesce(a.revision,0),'opened_at',a.opened_at_ms)
  FROM pedpsy.research_stages t LEFT JOIN pedpsy.group_stage_access a ON a.study_id=t.study_id AND a.stage_id=t.id AND a.group_id=target_group
  WHERE t.study_id=study AND t.id=target_stage
$$;
CREATE FUNCTION list_group_stage_access(study uuid,target_group uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE data jsonb;count_rows integer;
BEGIN
  PERFORM pedpsy.lock_study_design(study,false);
  PERFORM 1 FROM pedpsy.research_groups WHERE study_id=study AND id=target_group FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_AVAILABLE' USING ERRCODE='P0002';END IF;
  SELECT count(*)::integer,coalesce(jsonb_agg(pedpsy.group_stage_access_record(study,target_group,id) ORDER BY ordinal,id),'[]'::jsonb)
    INTO count_rows,data FROM (SELECT id,ordinal FROM pedpsy.research_stages WHERE study_id=study ORDER BY ordinal,id LIMIT 51) t;
  IF count_rows>50 OR octet_length(data::text)>4194304 THEN RAISE EXCEPTION 'DESIGN_LIMIT' USING ERRCODE='54000';END IF;
  PERFORM pedpsy.stage_access_audit('stages.access.read',study,target_group);RETURN data;
END $$;
CREATE FUNCTION open_group_stage(study uuid,target_group uuid,target_stage uuid,expected_revision integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE a record;current_access record;target uuid;at_ms bigint;
BEGIN
  -- Same current owner/staff identity and lock order as invitation management.
  PERFORM pedpsy.lock_group_invitation_owner(study,target_group);
  IF NOT EXISTS(SELECT 1 FROM pedpsy.studies WHERE id=study AND dataset_kind='demo' AND status='active')
    OR NOT EXISTS(SELECT 1 FROM pedpsy.research_groups WHERE study_id=study AND id=target_group AND status='active') THEN RAISE EXCEPTION 'NOT_AVAILABLE' USING ERRCODE='P0002';END IF;
  PERFORM 1 FROM pedpsy.research_stages WHERE study_id=study AND id=target_stage AND status='active' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_AVAILABLE' USING ERRCODE='P0002';END IF;
  IF NOT EXISTS(SELECT 1 FROM pedpsy.assignments WHERE study_id=study AND group_id=target_group AND stage_id=target_stage AND status='active')
    OR EXISTS(SELECT 1 FROM pedpsy.assignments WHERE study_id=study AND group_id=target_group AND stage_id=target_stage AND status='active' AND NOT pedpsy.constructor_release_allowed(release_id))
    THEN RAISE EXCEPTION 'NOT_AVAILABLE' USING ERRCODE='P0002';END IF;
  IF expected_revision IS NULL OR expected_revision NOT IN (0,1) THEN RAISE EXCEPTION 'INVALID_STUDY_INPUT' USING ERRCODE='22023';END IF;
  SELECT * INTO current_access FROM pedpsy.group_stage_access WHERE study_id=study AND group_id=target_group AND stage_id=target_stage FOR UPDATE;
  IF expected_revision<>(CASE WHEN FOUND THEN current_access.revision ELSE 0 END) THEN RAISE EXCEPTION 'STAGE_ACCESS_CONFLICT' USING ERRCODE='P0001';END IF;
  IF current_access.id IS NULL THEN
    SELECT * INTO a FROM pedpsy.account_actor();target:=gen_random_uuid();at_ms:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
    INSERT INTO pedpsy.group_stage_access(id,study_id,group_id,stage_id,opened_at_ms,opened_by_researcher,opened_by_staff)
      VALUES(target,study,target_group,target_stage,at_ms,CASE WHEN a.actor_role='researcher' THEN a.credential_id ELSE NULL END,
        CASE WHEN a.actor_role<>'researcher' THEN a.credential_id ELSE NULL END);
  ELSE target:=current_access.id;END IF;
  PERFORM pedpsy.stage_access_audit('stages.open',study,target);RETURN pedpsy.group_stage_access_record(study,target_group,target_stage);
END $$;
REVOKE ALL ON FUNCTION guard_group_stage_access(),stage_access_audit(text,uuid,uuid),group_stage_access_record(uuid,uuid,uuid),list_group_stage_access(uuid,uuid),open_group_stage(uuid,uuid,uuid,integer) FROM PUBLIC;
