SET LOCAL search_path=pedpsy,pg_catalog;
-- All participant writers use the same lock order; close/revoke operations
-- conflict with these SHARE/UPDATE locks, never bypass a checked snapshot.
CREATE FUNCTION lock_participant_scope(attempt uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE actor record; target record;
BEGIN
  SELECT * INTO actor FROM pedpsy.session_actor();
  IF NOT FOUND OR actor.actor_role<>'participant' THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE='28000'; END IF;
  PERFORM 1 FROM pedpsy.participant_credentials WHERE id=actor.credential_id FOR SHARE;
  PERFORM 1 FROM pedpsy.participant_sessions WHERE token_hash=current_setting('app.session_hash',true) FOR UPDATE;
  PERFORM 1 FROM pedpsy.studies WHERE id=actor.study_id FOR SHARE;
  PERFORM 1 FROM pedpsy.participants WHERE study_id=actor.study_id AND id=actor.participant_id FOR SHARE;
  SELECT a.* INTO target FROM pedpsy.attempts a JOIN pedpsy.stage_enrollments e ON (e.study_id,e.id)=(a.study_id,a.enrollment_id)
    WHERE a.id=attempt AND a.study_id=actor.study_id AND e.participant_id=actor.participant_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_AVAILABLE' USING ERRCODE='P0002'; END IF;
  PERFORM 1 FROM pedpsy.research_groups WHERE study_id=target.study_id AND id=target.group_id FOR SHARE;
  PERFORM 1 FROM pedpsy.research_stages WHERE study_id=target.study_id AND id=target.stage_id FOR SHARE;
  PERFORM 1 FROM pedpsy.stage_enrollments WHERE study_id=target.study_id AND id=target.enrollment_id FOR SHARE;
  PERFORM 1 FROM pedpsy.assignments WHERE study_id=target.study_id AND id=target.assignment_id FOR SHARE;
  PERFORM 1 FROM pedpsy.attempts WHERE id=target.id FOR UPDATE;
  IF NOT EXISTS(SELECT 1 FROM pedpsy.session_actor()) THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE='28000'; END IF;
  IF NOT pedpsy.owns_active_attempt(attempt) THEN RAISE EXCEPTION 'NOT_AVAILABLE' USING ERRCODE='P0002'; END IF;
END $$;
REVOKE ALL ON FUNCTION lock_participant_scope(uuid) FROM PUBLIC;
