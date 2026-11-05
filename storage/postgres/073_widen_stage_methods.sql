SET LOCAL search_path=pedpsy,pg_catalog;
-- 073: raise the per-group/per-stage method limit from 10 to 30.
-- Append-only replacement of the three functions that enforced the old limit.
-- Existing releases, assignments, responses and results are untouched.
CREATE OR REPLACE FUNCTION configure_study_assignments(study uuid,expected_version integer,target_group uuid,target_stage uuid,releases uuid[]) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
BEGIN
  PERFORM pedpsy.require_mutable_design(study,expected_version);
  IF releases IS NULL OR cardinality(releases)>30 OR array_position(releases,NULL) IS NOT NULL
    OR (SELECT count(DISTINCT id) FROM unnest(releases) id)<>cardinality(releases) THEN RAISE EXCEPTION 'INVALID_STUDY_INPUT' USING ERRCODE='22023';END IF;
  IF NOT EXISTS(SELECT 1 FROM pedpsy.research_groups WHERE study_id=study AND id=target_group AND status='active')
    OR NOT EXISTS(SELECT 1 FROM pedpsy.research_stages WHERE study_id=study AND id=target_stage AND status='active') THEN RAISE EXCEPTION 'NOT_AVAILABLE' USING ERRCODE='P0002';END IF;
  IF EXISTS(SELECT 1 FROM unnest(releases) id WHERE NOT pedpsy.constructor_release_allowed(id)) THEN RAISE EXCEPTION 'NOT_AVAILABLE' USING ERRCODE='P0002';END IF;
  PERFORM 1 FROM pedpsy.instrument_releases WHERE id=ANY(releases) ORDER BY id FOR SHARE;
  DELETE FROM pedpsy.assignments WHERE study_id=study AND group_id=target_group AND stage_id=target_stage AND NOT release_id=ANY(releases);
  INSERT INTO pedpsy.assignments(id,study_id,group_id,stage_id,release_id)
    SELECT gen_random_uuid(),study,target_group,target_stage,id FROM unnest(releases) id
    ON CONFLICT(study_id,group_id,stage_id,release_id) DO UPDATE SET status='active',updated_at=clock_timestamp();
  RETURN pedpsy.finish_study_design(study,'studies.assignments');
END $$;

CREATE OR REPLACE FUNCTION read_own_stages() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE scope record;binding record;pointer record;passport record;actor record;
  stage record;opening record;enrollment record;assignment record;
  data jsonb:='[]'::jsonb;ids jsonb;stages_count integer:=0;assignments_count integer;
  valid_assignments boolean;completed boolean;consented boolean;
BEGIN
  -- Existing scope locks identity/group/contact/current schema/policy/docs.
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
  -- Current contact acceptance is independently required by locked scope027.
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
      data:=data||jsonb_build_array(jsonb_build_object('stage_id',stage.id,'code',stage.code,
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

CREATE OR REPLACE FUNCTION lock_own_stage_requirements(target_stage uuid)
RETURNS TABLE(owner_study uuid,owner_participant uuid,owner_group uuid,passport_version integer,policy_revision integer,participation_version text,contact_version text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE scope record;binding record;pointer record;passport record;stage record;opening record;enrollment record;assignment record;assignment_count integer:=0;contact_policy record;
BEGIN
  SELECT * INTO scope FROM pedpsy.lock_own_consent_scope();
  SELECT * INTO binding FROM pedpsy.participant_group_bindings WHERE study_id=scope.owner_study AND participant_id=scope.owner_participant;
  SELECT * INTO pointer FROM pedpsy.study_passport_schemas WHERE study_id=scope.owner_study;
  SELECT * INTO passport FROM pedpsy.participant_passports WHERE study_id=scope.owner_study AND participant_id=scope.owner_participant FOR SHARE;
  PERFORM 1 FROM pedpsy.participant_consent_acceptances WHERE study_id=scope.owner_study AND participant_id=scope.owner_participant ORDER BY purpose,document_version FOR SHARE;
  PERFORM pedpsy.assert_own_passport_session();
  IF NOT pedpsy.effective_passport_completed(scope.owner_study,scope.owner_participant) OR NOT EXISTS(
    SELECT 1 FROM pedpsy.participant_consent_acceptances a WHERE a.study_id=scope.owner_study AND a.participant_id=scope.owner_participant
      AND a.purpose='study_participation' AND a.document_version=scope.participation_version) THEN
    RAISE EXCEPTION 'PARTICIPATION_REQUIREMENTS_CHANGED' USING ERRCODE='P0001';
  END IF;
  SELECT * INTO stage FROM pedpsy.research_stages WHERE study_id=scope.owner_study AND id=target_stage FOR SHARE;
  SELECT * INTO opening FROM pedpsy.group_stage_access WHERE study_id=scope.owner_study AND group_id=binding.group_id AND stage_id=target_stage FOR SHARE;
  SELECT * INTO enrollment FROM pedpsy.stage_enrollments WHERE study_id=scope.owner_study AND participant_id=scope.owner_participant AND stage_id=target_stage FOR SHARE;
  IF stage.id IS NULL OR stage.status<>'active' OR opening.id IS NULL OR opening.revision<>1
    OR (enrollment.id IS NOT NULL AND (enrollment.status<>'active' OR enrollment.group_id<>binding.group_id)) THEN
    RAISE EXCEPTION 'NOT_AVAILABLE' USING ERRCODE='P0002';
  END IF;
  FOR assignment IN SELECT * FROM pedpsy.assignments WHERE study_id=scope.owner_study AND group_id=binding.group_id AND stage_id=target_stage ORDER BY id FOR SHARE LOOP
    IF assignment.status='active' THEN
      assignment_count:=assignment_count+1;IF assignment_count>30 THEN RAISE EXCEPTION 'DESIGN_LIMIT' USING ERRCODE='54000';END IF;
      PERFORM 1 FROM pedpsy.instrument_releases WHERE id=assignment.release_id FOR SHARE;
      IF NOT pedpsy.constructor_release_allowed(assignment.release_id) THEN RAISE EXCEPTION 'NOT_AVAILABLE' USING ERRCODE='P0002';END IF;
    END IF;
  END LOOP;
  PERFORM pedpsy.assert_own_passport_session();
  IF assignment_count=0 THEN RAISE EXCEPTION 'NOT_AVAILABLE' USING ERRCODE='P0002';END IF;
  SELECT * INTO contact_policy FROM pedpsy.study_contact_policies WHERE study_id=scope.owner_study;
  RETURN QUERY SELECT scope.owner_study,scope.owner_participant,binding.group_id,pointer.schema_version,scope.policy_revision,scope.participation_version,contact_policy.notice_version;
END $$;

REVOKE ALL ON FUNCTION configure_study_assignments(uuid,integer,uuid,uuid,uuid[]),read_own_stages(),lock_own_stage_requirements(uuid) FROM PUBLIC;
