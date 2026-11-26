SET LOCAL search_path=pedpsy,pg_catalog;
-- 151: stage metadata must be returned by the already-granted SECURITY DEFINER
-- enrollment function. The previous adapter query paid RLS on release_items and
-- could take several seconds. Keep the same lock, audit and attempt semantics.
CREATE OR REPLACE FUNCTION enroll_own_stage(target_stage uuid,expected_opening integer,expected_schema integer,expected_policy integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE scope record;actor record;enrollment record;assignment record;target uuid;first_item text;basis record;data jsonb;created boolean:=false;effective_answers jsonb;
BEGIN
  IF target_stage IS NULL OR expected_opening IS DISTINCT FROM 1 OR expected_schema IS NULL OR expected_schema NOT BETWEEN 1 AND 2147483646
    OR expected_policy IS NULL OR expected_policy NOT BETWEEN 0 AND 2147483646 THEN RAISE EXCEPTION 'INVALID_ENROLLMENT_INPUT' USING ERRCODE='22023';END IF;
  SELECT * INTO scope FROM pedpsy.lock_own_stage_requirements(target_stage);
  IF expected_schema<>scope.passport_version OR expected_policy<>scope.policy_revision THEN RAISE EXCEPTION 'PARTICIPATION_REQUIREMENTS_CHANGED' USING ERRCODE='P0001';END IF;
  SELECT coalesce(
    (SELECT h.answers FROM pedpsy.research_profile_history h WHERE h.study_id=scope.owner_study AND h.participant_id=scope.owner_participant ORDER BY h.revision DESC LIMIT 1),
    (SELECT p.answers FROM pedpsy.participant_passports p WHERE p.study_id=scope.owner_study AND p.participant_id=scope.owner_participant AND p.status='completed')) INTO effective_answers;
  IF (CASE WHEN coalesce(effective_answers->>'age','') ~ '^[0-9]{1,3}$' THEN (effective_answers->>'age')::integer ELSE 0 END)<18 THEN
    RAISE EXCEPTION 'ADULT_PARTICIPANT_REQUIRED' USING ERRCODE='P0001';
  END IF;
  SELECT * INTO enrollment FROM pedpsy.stage_enrollments WHERE study_id=scope.owner_study AND participant_id=scope.owner_participant AND stage_id=target_stage FOR SHARE;
  PERFORM pedpsy.assert_own_passport_session();SELECT * INTO actor FROM pedpsy.session_actor() WHERE actor_role='participant';
  IF enrollment.id IS NULL THEN
    target:=gen_random_uuid();INSERT INTO pedpsy.stage_enrollments(id,study_id,participant_id,group_id,stage_id)
      VALUES(target,scope.owner_study,scope.owner_participant,scope.owner_group,target_stage);created:=true;
    INSERT INTO pedpsy.stage_admissions(study_id,enrollment_id,participant_id,group_id,stage_id,passport_schema_version,consent_policy_revision,participation_version,contact_notice_version,credential_id,admitted_at_ms)
      VALUES(scope.owner_study,target,scope.owner_participant,scope.owner_group,target_stage,scope.passport_version,scope.policy_revision,scope.participation_version,scope.contact_version,actor.credential_id,floor(extract(epoch FROM clock_timestamp())*1000)::bigint);
  ELSE
    target:=enrollment.id;SELECT * INTO basis FROM pedpsy.stage_admissions WHERE study_id=scope.owner_study AND enrollment_id=target FOR SHARE;
    IF basis.enrollment_id IS NULL THEN RAISE EXCEPTION 'NOT_AVAILABLE' USING ERRCODE='P0002';END IF;
  END IF;
  FOR assignment IN SELECT * FROM pedpsy.assignments WHERE study_id=scope.owner_study AND group_id=scope.owner_group AND stage_id=target_stage AND status='active' ORDER BY id LOOP
    IF created THEN
      SELECT item_id INTO first_item FROM pedpsy.release_items WHERE release_id=assignment.release_id ORDER BY ordinal LIMIT 1;
      IF first_item IS NULL THEN RAISE EXCEPTION 'NOT_AVAILABLE' USING ERRCODE='P0002';END IF;
      INSERT INTO pedpsy.attempts(id,study_id,enrollment_id,assignment_id,group_id,stage_id,release_id,current_item_id)
        VALUES(gen_random_uuid(),scope.owner_study,target,assignment.id,scope.owner_group,target_stage,assignment.release_id,first_item);
    ELSIF NOT EXISTS(SELECT 1 FROM pedpsy.attempts WHERE study_id=scope.owner_study AND enrollment_id=target AND assignment_id=assignment.id) THEN
      RAISE EXCEPTION 'NOT_AVAILABLE' USING ERRCODE='P0002';
    END IF;
  END LOOP;
  SELECT coalesce(jsonb_agg(jsonb_build_object('attempt_id',a.id,'assignment_id',a.assignment_id,'release_id',a.release_id,'status',a.status,
    'revision',a.revision,'current_item_id',a.current_item_id,
    'title',coalesce((SELECT p.title FROM pedpsy.release_presentation_corrections p
                      WHERE p.release_id=a.release_id AND p.title IS NOT NULL
                      ORDER BY p.created_at_ms DESC,p.id DESC LIMIT 1),
                     (SELECT ir.form_snapshot->>'title' FROM pedpsy.instrument_releases ir WHERE ir.id=a.release_id),
                     a.release_id::text),
    'item_count',coalesce((SELECT jsonb_array_length(ir.form_snapshot->'items') FROM pedpsy.instrument_releases ir WHERE ir.id=a.release_id),0),
    'presentation_id',(SELECT ir.form_snapshot->'presentation'->>'id' FROM pedpsy.instrument_releases ir WHERE ir.id=a.release_id))
    ORDER BY a.assignment_id),'[]'::jsonb) INTO data
    FROM (SELECT DISTINCT ON (attempt.assignment_id) attempt.*
      FROM pedpsy.attempts attempt JOIN pedpsy.assignments x ON (x.study_id,x.id)=(attempt.study_id,attempt.assignment_id)
      WHERE attempt.study_id=scope.owner_study AND attempt.enrollment_id=target AND x.status='active'
      ORDER BY attempt.assignment_id,attempt.attempt_no DESC) a;
  PERFORM pedpsy.assert_own_passport_session();
  INSERT INTO pedpsy.access_audit_events(id,at_ms,credential_id,study_id,action,outcome,reason,resource_id,record_count)
    VALUES(gen_random_uuid(),floor(extract(epoch FROM clock_timestamp())*1000)::bigint,actor.credential_id,scope.owner_study,'participants.stages.enroll','allow','OWN_SCOPE',target,jsonb_array_length(data));
  PERFORM pedpsy.assert_own_passport_session();PERFORM pedpsy.touch_session();
  RETURN jsonb_build_object('study_id',scope.owner_study,'group_id',scope.owner_group,'stage_id',target_stage,'enrollment_id',target,'attempts',data);
END $$;
