SET LOCAL search_path=pedpsy,pg_catalog;
-- Discovery only: no enrollment/attempt writes, fabricated T0, group move,
-- implicit consent, researcher/staff impersonation or legacy backfill.
CREATE FUNCTION read_own_stages() RETURNS jsonb
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
  completed:=coalesce(passport.status='completed',false);
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
      IF assignments_count>10 THEN RAISE EXCEPTION 'DESIGN_LIMIT' USING ERRCODE='54000';END IF;
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
REVOKE ALL ON FUNCTION read_own_stages() FROM PUBLIC;
