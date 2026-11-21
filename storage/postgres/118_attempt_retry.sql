SET LOCAL search_path=pedpsy,pg_catalog;
-- 118: a participant may retry an invalidated method. Attempts are versioned by
-- attempt_no; the stage screen always returns the latest attempt per assignment, so
-- old results stay in history without duplicating method cards.
ALTER TABLE attempts ADD COLUMN IF NOT EXISTS attempt_no integer NOT NULL DEFAULT 1
  CHECK(attempt_no BETWEEN 1 AND 1000);
ALTER TABLE attempts DROP CONSTRAINT IF EXISTS attempts_study_id_enrollment_id_assignment_id_key;
ALTER TABLE attempts ADD CONSTRAINT attempts_study_id_enrollment_id_assignment_id_attempt_no_key
  UNIQUE(study_id,enrollment_id,assignment_id,attempt_no);

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
      -- A successful atomic admission cannot have a partially missing attempt.
      RAISE EXCEPTION 'NOT_AVAILABLE' USING ERRCODE='P0002';
    END IF;
  END LOOP;
  SELECT coalesce(jsonb_agg(jsonb_build_object('attempt_id',a.id,'assignment_id',a.assignment_id,'release_id',a.release_id,'status',a.status,
    'revision',a.revision,'current_item_id',a.current_item_id) ORDER BY a.assignment_id),'[]'::jsonb) INTO data
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

CREATE OR REPLACE FUNCTION retry_own_attempt(target uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE s record;a record;new_id uuid;first_item text;next_no integer;
BEGIN
  SELECT * INTO s FROM pedpsy.session_actor();
  IF s.actor_role<>'participant' THEN RAISE EXCEPTION 'NOT_AVAILABLE' USING ERRCODE='P0002';END IF;
  SELECT * INTO a FROM pedpsy.attempts WHERE id=target FOR SHARE;
  IF a.id IS NULL OR a.study_id<>s.study_id OR a.status<>'completed' THEN RAISE EXCEPTION 'NOT_AVAILABLE' USING ERRCODE='P0002';END IF;
  IF NOT EXISTS(SELECT 1 FROM pedpsy.stage_enrollments e WHERE e.study_id=a.study_id AND e.id=a.enrollment_id
    AND e.participant_id=s.participant_id AND e.status='active') THEN RAISE EXCEPTION 'NOT_AVAILABLE' USING ERRCODE='P0002';END IF;
  IF NOT EXISTS(SELECT 1 FROM pedpsy.attempt_invalidations i WHERE i.attempt_id=target) THEN RAISE EXCEPTION 'NOT_AVAILABLE' USING ERRCODE='P0002';END IF;
  SELECT item_id INTO first_item FROM pedpsy.release_items WHERE release_id=a.release_id ORDER BY ordinal LIMIT 1;
  IF first_item IS NULL THEN RAISE EXCEPTION 'NOT_AVAILABLE' USING ERRCODE='P0002';END IF;
  SELECT coalesce(max(attempt_no),0)+1 INTO next_no FROM pedpsy.attempts
    WHERE study_id=a.study_id AND enrollment_id=a.enrollment_id AND assignment_id=a.assignment_id;
  new_id:=gen_random_uuid();
  INSERT INTO pedpsy.attempts(id,study_id,enrollment_id,assignment_id,group_id,stage_id,release_id,current_item_id,attempt_no)
    VALUES(new_id,a.study_id,a.enrollment_id,a.assignment_id,a.group_id,a.stage_id,a.release_id,first_item,next_no);
  RETURN new_id;
END $$;
REVOKE ALL ON FUNCTION retry_own_attempt(uuid) FROM PUBLIC;

-- Progress and analytics count the latest valid attempt and never an invalidated one.
CREATE OR REPLACE FUNCTION research_progress_rows_v2(study uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE data jsonb;count_rows integer;
BEGIN
  SELECT count(*)::integer,coalesce(jsonb_agg(jsonb_build_object('participant_id',q.participant_id,'group_id',q.group_id,'stage_id',q.stage_id,'status',q.status) ORDER BY q.group_id,q.stage_id,q.participant_id),'[]'::jsonb) INTO count_rows,data
  FROM (SELECT b.participant_id,b.group_id,t.id stage_id,
    CASE WHEN x.total>0 AND x.finished=x.total THEN 'completed' WHEN x.started>0 THEN 'in_progress' ELSE 'not_started' END status
    FROM pedpsy.participant_group_bindings b JOIN pedpsy.participants p ON (p.study_id,p.id)=(b.study_id,b.participant_id) AND p.status='active'
    JOIN pedpsy.research_groups g ON (g.study_id,g.id)=(b.study_id,b.group_id) AND g.status='active'
    JOIN pedpsy.participant_contacts c ON (c.study_id,c.participant_id)=(b.study_id,b.participant_id) AND c.status='active'
    JOIN pedpsy.research_stages t ON t.study_id=b.study_id AND t.status='active'
    CROSS JOIN LATERAL (SELECT count(*) total,count(*) FILTER(WHERE a.status='completed') finished,count(*) FILTER(WHERE a.status='completed' OR EXISTS(SELECT 1 FROM pedpsy.responses r WHERE r.study_id=a.study_id AND r.attempt_id=a.id)) started
      FROM pedpsy.assignments z LEFT JOIN LATERAL (SELECT aa.* FROM pedpsy.attempts aa
        WHERE aa.study_id=z.study_id AND aa.assignment_id=z.id
          AND aa.enrollment_id IN (SELECT en.id FROM pedpsy.stage_enrollments en WHERE en.study_id=b.study_id AND en.participant_id=b.participant_id)
          AND NOT EXISTS(SELECT 1 FROM pedpsy.attempt_invalidations i WHERE i.attempt_id=aa.id)
        ORDER BY aa.attempt_no DESC LIMIT 1) a ON true
      LEFT JOIN pedpsy.stage_enrollments e ON (e.study_id,e.id)=(a.study_id,a.enrollment_id)
      WHERE z.study_id=b.study_id AND z.group_id=b.group_id AND z.stage_id=t.id AND z.status='active' AND (e.id IS NULL OR e.status='active')) x
    WHERE b.study_id=study ORDER BY b.participant_id,t.id LIMIT 501) q;
  IF count_rows>500 OR octet_length(data::text)>1048576 THEN RAISE EXCEPTION 'EXPORT_LIMIT' USING ERRCODE='54000';END IF;
  RETURN data;
END $$;
REVOKE ALL ON FUNCTION research_progress_rows_v2(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION research_method_progress(study uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE registered integer;completed_any integer;rows jsonb;
BEGIN
  PERFORM pedpsy.lock_research_workbench(study);
  SELECT count(DISTINCT b.participant_id)::integer INTO registered
  FROM pedpsy.participant_group_bindings b
  JOIN pedpsy.participants p ON (p.study_id,p.id)=(b.study_id,b.participant_id) AND p.status='active'
  JOIN pedpsy.participant_contacts c ON (c.study_id,c.participant_id)=(b.study_id,b.participant_id) AND c.status='active'
  WHERE b.study_id=study;
  SELECT count(DISTINCT en.participant_id)::integer INTO completed_any
  FROM pedpsy.attempts a
  JOIN pedpsy.assignments z ON (z.study_id,z.id)=(a.study_id,a.assignment_id) AND z.status='active'
  JOIN pedpsy.stage_enrollments en ON (en.study_id,en.id)=(a.study_id,a.enrollment_id) AND en.status='active'
  JOIN pedpsy.participants p ON (p.study_id,p.id)=(en.study_id,en.participant_id) AND p.status='active'
  JOIN pedpsy.participant_contacts c ON (c.study_id,c.participant_id)=(en.study_id,en.participant_id) AND c.status='active'
  WHERE a.study_id=study AND a.status='completed' AND NOT EXISTS(SELECT 1 FROM pedpsy.attempt_invalidations i WHERE i.attempt_id=a.id);
  SELECT coalesce(jsonb_agg(jsonb_build_object('release_id',z.release_id,'method_id',r.method_id,'completed',coalesce(x.completed,0)) ORDER BY r.method_id),'[]'::jsonb) INTO rows
  FROM (SELECT DISTINCT release_id FROM pedpsy.assignments WHERE study_id=study AND status='active') z
  JOIN pedpsy.instrument_releases r ON r.id=z.release_id
  LEFT JOIN LATERAL (
    SELECT count(DISTINCT en.participant_id)::integer completed
    FROM pedpsy.attempts a
    JOIN pedpsy.assignments zz ON (zz.study_id,zz.id)=(a.study_id,a.assignment_id) AND zz.status='active' AND zz.release_id=z.release_id
    JOIN pedpsy.stage_enrollments en ON (en.study_id,en.id)=(a.study_id,a.enrollment_id) AND en.status='active'
    JOIN pedpsy.participants p ON (p.study_id,p.id)=(en.study_id,en.participant_id) AND p.status='active'
    JOIN pedpsy.participant_contacts c ON (c.study_id,c.participant_id)=(en.study_id,en.participant_id) AND c.status='active'
    WHERE a.study_id=study AND a.status='completed' AND NOT EXISTS(SELECT 1 FROM pedpsy.attempt_invalidations i WHERE i.attempt_id=a.id)
  ) x ON true;
  PERFORM pedpsy.constructor_audit('studies.method_progress.read',study);
  RETURN jsonb_build_object('registered',registered,'completed_any',completed_any,'rows',rows);
END $$;
CREATE OR REPLACE FUNCTION research_method_analytics(study uuid, group_filter uuid DEFAULT NULL, stage_filter uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE registered integer;completed_any integer;completed_all integer;rows jsonb;
BEGIN
  PERFORM pedpsy.lock_research_workbench(study);
  SELECT count(DISTINCT b.participant_id)::integer INTO registered
  FROM pedpsy.participant_group_bindings b
  JOIN pedpsy.participants p ON (p.study_id,p.id)=(b.study_id,b.participant_id) AND p.status='active'
  JOIN pedpsy.participant_contacts c ON (c.study_id,c.participant_id)=(b.study_id,b.participant_id) AND c.status='active'
  WHERE b.study_id=study AND (group_filter IS NULL OR b.group_id=group_filter);
  SELECT count(DISTINCT en.participant_id)::integer INTO completed_any
  FROM pedpsy.attempts a
  JOIN pedpsy.assignments z ON (z.study_id,z.id)=(a.study_id,a.assignment_id) AND z.status='active'
  JOIN pedpsy.stage_enrollments en ON (en.study_id,en.id)=(a.study_id,a.enrollment_id) AND en.status='active'
  JOIN pedpsy.participants p ON (p.study_id,p.id)=(en.study_id,en.participant_id) AND p.status='active'
  JOIN pedpsy.participant_contacts c ON (c.study_id,c.participant_id)=(en.study_id,en.participant_id) AND c.status='active'
  WHERE a.study_id=study AND a.status='completed' AND NOT EXISTS(SELECT 1 FROM pedpsy.attempt_invalidations i WHERE i.attempt_id=a.id)
    AND (group_filter IS NULL OR z.group_id=group_filter) AND (stage_filter IS NULL OR z.stage_id=stage_filter);
  SELECT count(*)::integer INTO completed_all FROM (
    SELECT en.participant_id
    FROM pedpsy.attempts a
    JOIN pedpsy.assignments z ON (z.study_id,z.id)=(a.study_id,a.assignment_id) AND z.status='active'
    JOIN pedpsy.stage_enrollments en ON (en.study_id,en.id)=(a.study_id,a.enrollment_id) AND en.status='active'
    JOIN pedpsy.participants p ON (p.study_id,p.id)=(en.study_id,en.participant_id) AND p.status='active'
    JOIN pedpsy.participant_contacts c ON (c.study_id,c.participant_id)=(en.study_id,en.participant_id) AND c.status='active'
    WHERE a.study_id=study AND a.status='completed' AND NOT EXISTS(SELECT 1 FROM pedpsy.attempt_invalidations i WHERE i.attempt_id=a.id)
      AND (group_filter IS NULL OR z.group_id=group_filter) AND (stage_filter IS NULL OR z.stage_id=stage_filter)
    GROUP BY en.participant_id
    HAVING count(DISTINCT z.id)=(
      SELECT count(DISTINCT z2.id) FROM pedpsy.assignments z2
      WHERE z2.study_id=study AND z2.status='active'
        AND (group_filter IS NULL OR z2.group_id=group_filter) AND (stage_filter IS NULL OR z2.stage_id=stage_filter)
    )
  ) q;
  WITH filtered AS (
    SELECT z.release_id,en.participant_id,a.id attempt_id,a.completed_at
    FROM pedpsy.attempts a
    JOIN pedpsy.assignments z ON (z.study_id,z.id)=(a.study_id,a.assignment_id) AND z.status='active'
    JOIN pedpsy.stage_enrollments en ON (en.study_id,en.id)=(a.study_id,a.enrollment_id) AND en.status='active'
    WHERE a.study_id=study AND a.status='completed' AND NOT EXISTS(SELECT 1 FROM pedpsy.attempt_invalidations i WHERE i.attempt_id=a.id)
      AND (group_filter IS NULL OR z.group_id=group_filter) AND (stage_filter IS NULL OR z.stage_id=stage_filter)
  ), latest AS (
    SELECT DISTINCT ON (release_id,participant_id) release_id,participant_id,attempt_id
    FROM filtered ORDER BY release_id,participant_id,completed_at DESC NULLS LAST,attempt_id
  ), payloads AS (
    SELECT l.release_id,l.participant_id,ar.payload
    FROM latest l JOIN pedpsy.attempt_results ar ON ar.attempt_id=l.attempt_id
  ), cls AS (
    SELECT p.release_id,c->>'code' code,c->>'label' label,c->>'value' value
    FROM payloads p CROSS JOIN LATERAL jsonb_array_elements(p.payload->'classifications') c
  ), ms AS (
    SELECT p.release_id,m->>'code' code,m->>'label' label,(m->>'value')::numeric value
    FROM payloads p CROSS JOIN LATERAL jsonb_array_elements(p.payload->'measures') m
    WHERE m->>'value_type'='number' AND (m->>'value') ~ '^-?[0-9]+([.][0-9]+)?$'
  ), sums AS (
    SELECT x.release_id,r.method_id,r.method_version_id,
      (SELECT count(*)::integer FROM payloads p WHERE p.release_id=x.release_id) completed,
      coalesce((SELECT jsonb_agg(jsonb_build_object('code',code,'label',label,'value',value,'count',n)) FROM (SELECT code,max(label) label,value,count(*) n FROM cls WHERE release_id=x.release_id GROUP BY code,value) q),'[]'::jsonb) levels,
      coalesce((SELECT jsonb_agg(jsonb_build_object('code',code,'label',label,'n',n,'mean',mean)) FROM (SELECT code,max(label) label,count(*) n,avg(value) mean FROM ms WHERE release_id=x.release_id GROUP BY code) q),'[]'::jsonb) measures
    FROM (SELECT DISTINCT release_id FROM filtered) x
    JOIN pedpsy.instrument_releases r ON r.id=x.release_id
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object('release_id',release_id,'method_id',method_id,'method_version_id',method_version_id,'completed',completed,'levels',levels,'measures',measures) ORDER BY method_id),'[]'::jsonb) INTO rows FROM sums;
  PERFORM pedpsy.constructor_audit('studies.method_analytics.read',study);
  RETURN jsonb_build_object('registered',registered,'completed_any',completed_any,'completed_all',completed_all,'rows',rows);
END $$;
