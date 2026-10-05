SET LOCAL search_path=pedpsy,pg_catalog;
-- Own synthetic admission, immutable basis, no staff impersonation/backfill.
CREATE UNIQUE INDEX enrollment_admission_identity ON stage_enrollments(study_id,id,participant_id,group_id,stage_id);
CREATE UNIQUE INDEX binding_admission_identity ON participant_group_bindings(study_id,participant_id,group_id);
CREATE TABLE stage_admissions(
  study_id uuid NOT NULL,enrollment_id uuid NOT NULL,participant_id uuid NOT NULL,group_id uuid NOT NULL,stage_id uuid NOT NULL,
  passport_schema_version integer NOT NULL,consent_policy_revision integer NOT NULL CHECK(consent_policy_revision BETWEEN 0 AND 2147483646),
  participation_purpose text GENERATED ALWAYS AS ('study_participation'::text) STORED,
  participation_version text NOT NULL,contact_notice_version text NOT NULL REFERENCES contact_notices(version),
  credential_id uuid NOT NULL,admitted_at_ms bigint NOT NULL CHECK(admitted_at_ms BETWEEN 0 AND 9007199254740991),
  PRIMARY KEY(study_id,enrollment_id),
  FOREIGN KEY(study_id,enrollment_id,participant_id,group_id,stage_id) REFERENCES stage_enrollments(study_id,id,participant_id,group_id,stage_id),
  FOREIGN KEY(study_id,participant_id,group_id) REFERENCES participant_group_bindings(study_id,participant_id,group_id),
  FOREIGN KEY(study_id,passport_schema_version) REFERENCES passport_schema_versions(study_id,schema_version),
  FOREIGN KEY(study_id,participant_id,participation_purpose,participation_version) REFERENCES participant_consent_acceptances(study_id,participant_id,purpose,document_version),
  FOREIGN KEY(credential_id,study_id,participant_id) REFERENCES participant_credentials(id,study_id,participant_id)
);
CREATE INDEX admission_binding ON stage_admissions(study_id,participant_id,group_id);
CREATE INDEX admission_schema ON stage_admissions(study_id,passport_schema_version);
CREATE INDEX admission_consent ON stage_admissions(study_id,participant_id,participation_purpose,participation_version);
CREATE INDEX admission_credential ON stage_admissions(credential_id,study_id,participant_id);
CREATE INDEX admission_contact_notice ON stage_admissions(contact_notice_version);
CREATE TRIGGER admission_immutable BEFORE UPDATE OR DELETE ON stage_admissions FOR EACH ROW EXECUTE FUNCTION immutable_row();
ALTER TABLE stage_admissions ENABLE ROW LEVEL SECURITY;REVOKE ALL ON stage_admissions FROM PUBLIC;

CREATE FUNCTION lock_own_stage_requirements(target_stage uuid)
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
  IF passport.status IS DISTINCT FROM 'completed' OR passport.schema_version IS DISTINCT FROM pointer.schema_version OR NOT EXISTS(
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
      assignment_count:=assignment_count+1;IF assignment_count>10 THEN RAISE EXCEPTION 'DESIGN_LIMIT' USING ERRCODE='54000';END IF;
      PERFORM 1 FROM pedpsy.instrument_releases WHERE id=assignment.release_id FOR SHARE;
      IF NOT pedpsy.constructor_release_allowed(assignment.release_id) THEN RAISE EXCEPTION 'NOT_AVAILABLE' USING ERRCODE='P0002';END IF;
    END IF;
  END LOOP;
  PERFORM pedpsy.assert_own_passport_session();
  IF assignment_count=0 THEN RAISE EXCEPTION 'NOT_AVAILABLE' USING ERRCODE='P0002';END IF;
  SELECT * INTO contact_policy FROM pedpsy.study_contact_policies WHERE study_id=scope.owner_study;
  RETURN QUERY SELECT scope.owner_study,scope.owner_participant,binding.group_id,pointer.schema_version,scope.policy_revision,scope.participation_version,contact_policy.notice_version;
END $$;

CREATE FUNCTION current_admission_allows(target_study uuid,target_participant uuid,target_enrollment uuid,target_group uuid,target_stage uuid,target_release uuid)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE actor record;scope record;basis record;
BEGIN
  SELECT * INTO actor FROM pedpsy.session_actor() WHERE actor_role='participant';
  IF NOT FOUND OR actor.study_id IS DISTINCT FROM target_study OR actor.participant_id IS DISTINCT FROM target_participant THEN RETURN false;END IF;
  -- Only the existing unbound synthetic cohort retains the old admission rule.
  IF NOT EXISTS(SELECT 1 FROM pedpsy.participant_group_bindings WHERE study_id=target_study AND participant_id=target_participant) THEN RETURN true;END IF;
  IF NOT EXISTS(SELECT 1 FROM pedpsy.stage_admissions WHERE study_id=target_study AND enrollment_id=target_enrollment AND participant_id=target_participant AND group_id=target_group AND stage_id=target_stage) THEN RETURN false;END IF;
  SELECT * INTO scope FROM pedpsy.lock_own_stage_requirements(target_stage);
  SELECT * INTO basis FROM pedpsy.stage_admissions WHERE study_id=target_study AND enrollment_id=target_enrollment FOR SHARE;
  PERFORM pedpsy.assert_own_passport_session();
  RETURN scope.owner_group=target_group AND basis.participant_id=target_participant AND basis.stage_id=target_stage
    AND pedpsy.constructor_release_allowed(target_release);
EXCEPTION WHEN SQLSTATE 'P0002' OR SQLSTATE 'P0001' OR SQLSTATE '28000' THEN
  -- RLS/session metadata must filter unavailable attempts, not prevent the
  -- participant from reading/accepting the newly current consent document.
  RETURN false;
END $$;
CREATE OR REPLACE FUNCTION owns_active_attempt(attempt uuid) RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
  SELECT EXISTS(SELECT 1 FROM pedpsy.attempts a JOIN pedpsy.stage_enrollments e ON (e.study_id,e.id)=(a.study_id,a.enrollment_id)
    JOIN pedpsy.assignments x ON (x.study_id,x.id)=(a.study_id,a.assignment_id) JOIN pedpsy.research_groups g ON (g.study_id,g.id)=(a.study_id,a.group_id)
    JOIN pedpsy.research_stages t ON (t.study_id,t.id)=(a.study_id,a.stage_id) JOIN pedpsy.session_actor() s ON (s.study_id,s.participant_id)=(a.study_id,e.participant_id)
    WHERE a.id=attempt AND s.actor_role='participant' AND e.status='active' AND x.status='active' AND g.status='active' AND t.status='active'
      AND pedpsy.current_admission_allows(a.study_id,e.participant_id,e.id,a.group_id,a.stage_id,a.release_id))
$$;
CREATE OR REPLACE FUNCTION lock_participant_scope(attempt uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE actor record;target record;
BEGIN
  SELECT * INTO actor FROM pedpsy.session_actor();
  IF NOT FOUND OR actor.actor_role<>'participant' THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE='28000';END IF;
  PERFORM 1 FROM pedpsy.participant_credentials WHERE id=actor.credential_id FOR SHARE;
  PERFORM 1 FROM pedpsy.participant_sessions WHERE token_hash=current_setting('app.session_hash',true) FOR UPDATE;
  PERFORM 1 FROM pedpsy.studies WHERE id=actor.study_id FOR SHARE;
  PERFORM 1 FROM pedpsy.participants WHERE study_id=actor.study_id AND id=actor.participant_id FOR SHARE;
  SELECT a.* INTO target FROM pedpsy.attempts a JOIN pedpsy.stage_enrollments e ON (e.study_id,e.id)=(a.study_id,a.enrollment_id)
    WHERE a.id=attempt AND a.study_id=actor.study_id AND e.participant_id=actor.participant_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_AVAILABLE' USING ERRCODE='P0002';END IF;
  -- New cohort follows identity/group/contact/schema/consent before stage,
  -- enrollment/assignment/attempt; no late reversed-lock admission extension.
  IF EXISTS(SELECT 1 FROM pedpsy.participant_group_bindings WHERE study_id=actor.study_id AND participant_id=actor.participant_id) THEN
    PERFORM pedpsy.lock_own_stage_requirements(target.stage_id);
  END IF;
  PERFORM 1 FROM pedpsy.research_groups WHERE study_id=target.study_id AND id=target.group_id FOR SHARE;
  PERFORM 1 FROM pedpsy.research_stages WHERE study_id=target.study_id AND id=target.stage_id FOR SHARE;
  PERFORM 1 FROM pedpsy.stage_enrollments WHERE study_id=target.study_id AND id=target.enrollment_id FOR SHARE;
  PERFORM 1 FROM pedpsy.assignments WHERE study_id=target.study_id AND id=target.assignment_id FOR SHARE;
  PERFORM 1 FROM pedpsy.attempts WHERE id=target.id FOR UPDATE;
  IF NOT EXISTS(SELECT 1 FROM pedpsy.session_actor()) THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE='28000';END IF;
  IF NOT pedpsy.owns_active_attempt(attempt) THEN RAISE EXCEPTION 'NOT_AVAILABLE' USING ERRCODE='P0002';END IF;
END $$;

CREATE FUNCTION enroll_own_stage(target_stage uuid,expected_opening integer,expected_schema integer,expected_policy integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE scope record;actor record;enrollment record;assignment record;target uuid;first_item text;basis record;data jsonb;created boolean:=false;
BEGIN
  IF target_stage IS NULL OR expected_opening IS DISTINCT FROM 1 OR expected_schema IS NULL OR expected_schema NOT BETWEEN 1 AND 2147483646
    OR expected_policy IS NULL OR expected_policy NOT BETWEEN 0 AND 2147483646 THEN RAISE EXCEPTION 'INVALID_ENROLLMENT_INPUT' USING ERRCODE='22023';END IF;
  SELECT * INTO scope FROM pedpsy.lock_own_stage_requirements(target_stage);
  IF expected_schema<>scope.passport_version OR expected_policy<>scope.policy_revision THEN RAISE EXCEPTION 'PARTICIPATION_REQUIREMENTS_CHANGED' USING ERRCODE='P0001';END IF;
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
      -- A successful atomic admission cannot have a partially missing attempt.
      RAISE EXCEPTION 'NOT_AVAILABLE' USING ERRCODE='P0002';
    END IF;
  END LOOP;
  SELECT coalesce(jsonb_agg(jsonb_build_object('attempt_id',a.id,'assignment_id',a.assignment_id,'release_id',a.release_id,'status',a.status,
    'revision',a.revision,'current_item_id',a.current_item_id) ORDER BY a.assignment_id),'[]'::jsonb) INTO data
    FROM pedpsy.attempts a JOIN pedpsy.assignments x ON (x.study_id,x.id)=(a.study_id,a.assignment_id)
    WHERE a.study_id=scope.owner_study AND a.enrollment_id=target AND x.status='active';
  PERFORM pedpsy.assert_own_passport_session();
  INSERT INTO pedpsy.access_audit_events(id,at_ms,credential_id,study_id,action,outcome,reason,resource_id,record_count)
    VALUES(gen_random_uuid(),floor(extract(epoch FROM clock_timestamp())*1000)::bigint,actor.credential_id,scope.owner_study,'participants.stages.enroll','allow','OWN_SCOPE',target,jsonb_array_length(data));
  PERFORM pedpsy.assert_own_passport_session();PERFORM pedpsy.touch_session();
  RETURN jsonb_build_object('study_id',scope.owner_study,'group_id',scope.owner_group,'stage_id',target_stage,'enrollment_id',target,'attempts',data);
END $$;
REVOKE ALL ON FUNCTION lock_own_stage_requirements(uuid),current_admission_allows(uuid,uuid,uuid,uuid,uuid,uuid),enroll_own_stage(uuid,integer,integer,integer) FROM PUBLIC;
