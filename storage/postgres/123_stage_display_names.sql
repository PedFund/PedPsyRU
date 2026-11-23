SET LOCAL search_path=pedpsy,pg_catalog;
-- 123: participant-facing stage names. The internal stage code, ordinal and all
-- links to assignments/attempts/responses stay untouched. Existing stages keep
-- display_name NULL and continue to fall back to their code on the participant
-- screen. The column is nullable so old studies need no backfill.
ALTER TABLE research_stages ADD COLUMN display_name text;
ALTER TABLE research_stages ADD CONSTRAINT research_stages_display_name_check
  CHECK(display_name IS NULL OR (length(trim(display_name)) BETWEEN 1 AND 200 AND display_name !~ '[[:cntrl:]]'));

-- Keep the 017 size guard and the 014 catalogue composition intact. Only the
-- base snapshot gains the new nullable display_name.
CREATE OR REPLACE FUNCTION study_base_snapshot(study uuid) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
  SELECT jsonb_build_object('id',s.id,'title',s.title,'status',s.status,'version',s.design_version,'dataset_kind',s.dataset_kind,
    'groups',coalesce((SELECT jsonb_agg(jsonb_build_object('id',g.id,'name',g.name,'kind',g.kind,'status',g.status) ORDER BY g.created_at,g.id) FROM pedpsy.research_groups g WHERE g.study_id=s.id),'[]'::jsonb),
    'stages',coalesce((SELECT jsonb_agg(jsonb_build_object('id',t.id,'code',t.code,'display_name',t.display_name,'ordinal',t.ordinal,'status',t.status,'based_on_stage_id',t.based_on_stage_id) ORDER BY t.ordinal,t.id) FROM pedpsy.research_stages t WHERE t.study_id=s.id),'[]'::jsonb),
    'assignments',coalesce((SELECT jsonb_agg(jsonb_build_object('id',x.id,'group_id',x.group_id,'stage_id',x.stage_id,'release_id',x.release_id,'status',x.status) ORDER BY x.stage_id,x.group_id,x.id) FROM pedpsy.assignments x WHERE x.study_id=s.id),'[]'::jsonb))
  FROM pedpsy.studies s WHERE s.id=study AND s.dataset_kind='demo'
$$;

CREATE OR REPLACE FUNCTION read_own_stages() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE scope record;binding record;pointer record;passport record;actor record;
  stage record;opening record;enrollment record;assignment record;
  data jsonb:='[]'::jsonb;ids jsonb;stages_count integer:=0;assignments_count integer;
  valid_assignments boolean;completed boolean;consented boolean;
BEGIN
  SELECT * INTO scope FROM pedpsy.lock_own_consent_scope();
  SELECT * INTO binding FROM pedpsy.participant_group_bindings
    WHERE study_id=scope.owner_study AND participant_id=scope.owner_participant;
  SELECT * INTO pointer FROM pedpsy.study_passport_schemas WHERE study_id=scope.owner_study;
  SELECT * INTO passport FROM pedpsy.participant_passports
    WHERE study_id=scope.owner_study AND participant_id=scope.owner_participant FOR SHARE;
  PERFORM 1 FROM pedpsy.participant_consent_acceptances
    WHERE study_id=scope.owner_study AND participant_id=scope.owner_participant
    ORDER BY purpose,document_version FOR SHARE;
  PERFORM pedpsy.assert_own_passport_session();
  IF passport.schema_version IS NOT NULL AND passport.schema_version<>pointer.schema_version THEN
    RAISE EXCEPTION 'PARTICIPATION_REQUIREMENTS_CHANGED' USING ERRCODE='P0001';
  END IF;
  completed:=pedpsy.effective_passport_completed(scope.owner_study,scope.owner_participant);
  consented:=EXISTS(SELECT 1 FROM pedpsy.participant_consent_acceptances
    WHERE study_id=scope.owner_study AND participant_id=scope.owner_participant
      AND purpose='study_participation' AND document_version=scope.participation_version);
  FOR stage IN SELECT * FROM pedpsy.research_stages WHERE study_id=scope.owner_study
    ORDER BY id FOR SHARE LOOP
    stages_count:=stages_count+1;
    IF stages_count>50 THEN RAISE EXCEPTION 'DESIGN_LIMIT' USING ERRCODE='54000';END IF;
    SELECT * INTO opening FROM pedpsy.group_stage_access
      WHERE study_id=scope.owner_study AND group_id=binding.group_id AND stage_id=stage.id FOR SHARE;
    SELECT * INTO enrollment FROM pedpsy.stage_enrollments
      WHERE study_id=scope.owner_study AND participant_id=scope.owner_participant AND stage_id=stage.id FOR SHARE;
    ids:='[]'::jsonb;assignments_count:=0;valid_assignments:=true;
    FOR assignment IN SELECT * FROM pedpsy.assignments
      WHERE study_id=scope.owner_study AND group_id=binding.group_id AND stage_id=stage.id
      ORDER BY id FOR SHARE LOOP
      assignments_count:=assignments_count+1;
      IF assignments_count>30 THEN RAISE EXCEPTION 'DESIGN_LIMIT' USING ERRCODE='54000';END IF;
      IF assignment.status='active' THEN
        PERFORM 1 FROM pedpsy.instrument_releases WHERE id=assignment.release_id FOR SHARE;
        IF NOT pedpsy.constructor_release_allowed(assignment.release_id) THEN valid_assignments:=false;END IF;
        ids:=ids||jsonb_build_array(assignment.id);
      END IF;
    END LOOP;
    PERFORM pedpsy.assert_own_passport_session();
    IF stage.status='active' AND opening.id IS NOT NULL AND valid_assignments AND jsonb_array_length(ids)>0
      AND (enrollment.id IS NULL OR (enrollment.status='active' AND enrollment.group_id=binding.group_id)) THEN
      data:=data||jsonb_build_array(jsonb_build_object('stage_id',stage.id,'code',stage.code,'display_name',stage.display_name,
        'ordinal',stage.ordinal,'opening_revision',opening.revision,'assignment_ids',ids));
    END IF;
  END LOOP;
  SELECT coalesce(jsonb_agg(value ORDER BY (value->>'ordinal')::integer,value->>'stage_id'),'[]'::jsonb)
    INTO data FROM jsonb_array_elements(data);
  PERFORM pedpsy.assert_own_passport_session();SELECT * INTO actor FROM pedpsy.session_actor() WHERE actor_role='participant';
  INSERT INTO pedpsy.access_audit_events(id,at_ms,credential_id,study_id,action,outcome,reason,resource_id,record_count)
    VALUES(gen_random_uuid(),floor(extract(epoch FROM clock_timestamp())*1000)::bigint,actor.credential_id,scope.owner_study,
      'participants.stages.read','allow','OWN_SCOPE',scope.owner_participant,jsonb_array_length(data));
  PERFORM pedpsy.assert_own_passport_session();PERFORM pedpsy.touch_session();
  RETURN jsonb_build_object('study_id',scope.owner_study,'group_id',binding.group_id,
    'passport_schema_version',pointer.schema_version,'passport_completed',completed,
    'required_consents_accepted',consented,'stages',data);
END $$;

-- Named variants keep the original configure/copy functions and their locks and
-- audits intact. They only add the display name after the existing write.
CREATE FUNCTION configure_study_stage_named(study uuid,expected_version integer,target_stage uuid,stage_code text,stage_ordinal integer,stage_display_name text,create_new boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
BEGIN
  IF stage_display_name IS NOT NULL AND (length(stage_display_name)>200 OR stage_display_name ~ '[[:cntrl:]]') THEN RAISE EXCEPTION 'INVALID_STUDY_INPUT' USING ERRCODE='22023';END IF;
  PERFORM pedpsy.configure_study_stage(study,expected_version,target_stage,stage_code,stage_ordinal,create_new);
  IF stage_display_name IS NOT NULL THEN
    UPDATE pedpsy.research_stages SET display_name=nullif(trim(stage_display_name),''),updated_at=clock_timestamp()
      WHERE study_id=study AND id=target_stage;
  END IF;
  RETURN pedpsy.study_design_snapshot(study);
END $$;

CREATE FUNCTION copy_study_stage_named(study uuid,expected_version integer,source_stage uuid,new_stage uuid,new_code text,new_ordinal integer,new_display_name text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
BEGIN
  IF new_display_name IS NOT NULL AND (length(new_display_name)>200 OR new_display_name ~ '[[:cntrl:]]') THEN RAISE EXCEPTION 'INVALID_STUDY_INPUT' USING ERRCODE='22023';END IF;
  PERFORM pedpsy.copy_study_stage(study,expected_version,source_stage,new_stage,new_code,new_ordinal);
  IF new_display_name IS NOT NULL THEN
    UPDATE pedpsy.research_stages SET display_name=nullif(trim(new_display_name),''),updated_at=clock_timestamp()
      WHERE study_id=study AND id=new_stage;
  END IF;
  RETURN pedpsy.study_design_snapshot(study);
END $$;

-- A display name is presentation metadata: it may be changed after activation
-- without touching code, ordinal, assignments, attempts, responses or results.
-- The audit records who changed what; design_version stays unchanged.
CREATE FUNCTION set_stage_display_name(study uuid,target_stage uuid,display_name text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
BEGIN
  PERFORM pedpsy.lock_research_workbench(study);
  IF display_name IS NOT NULL AND (length(display_name)>200 OR display_name ~ '[[:cntrl:]]') THEN RAISE EXCEPTION 'INVALID_STUDY_INPUT' USING ERRCODE='22023';END IF;
  IF NOT EXISTS(SELECT 1 FROM pedpsy.research_stages WHERE study_id=study AND id=target_stage) THEN RAISE EXCEPTION 'NOT_AVAILABLE' USING ERRCODE='P0002';END IF;
  UPDATE pedpsy.research_stages SET display_name=nullif(trim(display_name),''),updated_at=clock_timestamp()
    WHERE study_id=study AND id=target_stage;
  PERFORM pedpsy.constructor_audit('studies.stage.display_name',study);
  RETURN pedpsy.research_workbench_snapshot(study);
END $$;

-- The workbench stage action already owns the stage validation and audit. Wrap
-- it so a display name can be saved without editing the large v3 function.
ALTER FUNCTION change_research_workbench(uuid,integer,text,jsonb) RENAME TO change_research_workbench_v3;
CREATE FUNCTION change_research_workbench(study uuid,expected integer,action text,input jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE target uuid;result jsonb;
BEGIN
  IF action='stage_name' THEN
    IF input IS NULL OR jsonb_typeof(input)<>'object' THEN RAISE EXCEPTION 'INVALID_STUDY_INPUT' USING ERRCODE='22023';END IF;
    target:=(input->>'id')::uuid;
    IF target IS NULL THEN RAISE EXCEPTION 'INVALID_STUDY_INPUT' USING ERRCODE='22023';END IF;
    RETURN pedpsy.set_stage_display_name(study,target,input->>'display_name');
  END IF;
  IF action='stage' THEN
    IF input IS NULL OR jsonb_typeof(input)<>'object' THEN RAISE EXCEPTION 'INVALID_STUDY_INPUT' USING ERRCODE='22023';END IF;
    IF input ? 'display_name' AND input->>'display_name' IS NOT NULL
      AND (length(input->>'display_name')>200 OR input->>'display_name' ~ '[[:cntrl:]]') THEN RAISE EXCEPTION 'INVALID_STUDY_INPUT' USING ERRCODE='22023';END IF;
    target:=CASE WHEN input->>'id' IS NULL THEN NULL ELSE (input->>'id')::uuid END;
    result:=pedpsy.change_research_workbench_v3(study,expected,action,input);
    IF input ? 'display_name' THEN
      UPDATE pedpsy.research_stages SET display_name=nullif(trim(input->>'display_name'),''),updated_at=clock_timestamp()
        WHERE study_id=study AND (id=target OR (target IS NULL AND code=input->>'code'));
    END IF;
    RETURN pedpsy.research_workbench_snapshot(study);
  END IF;
  RETURN pedpsy.change_research_workbench_v3(study,expected,action,input);
END $$;

REVOKE ALL ON FUNCTION configure_study_stage_named(uuid,integer,uuid,text,integer,text,boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION copy_study_stage_named(uuid,integer,uuid,uuid,text,integer,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION set_stage_display_name(uuid,uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION change_research_workbench(uuid,integer,text,jsonb),change_research_workbench_v3(uuid,integer,text,jsonb) FROM PUBLIC;
