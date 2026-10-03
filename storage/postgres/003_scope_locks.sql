SET LOCAL search_path=pedpsy,pg_catalog;
-- Wall-clock checks remain valid after waiting on a lock. A preceding writer
-- may have touched last_seen after this statement originally started.
CREATE OR REPLACE FUNCTION session_actor() RETURNS TABLE(credential_id uuid, study_id uuid, participant_id uuid, actor_role text, credential_version integer, expires_at_ms bigint)
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
  SELECT c.id,c.study_id,c.participant_id,'participant'::text,c.version,s.expires_at_ms
  FROM pedpsy.participant_sessions s JOIN pedpsy.participant_credentials c ON (c.id,c.study_id,c.participant_id)=(s.credential_id,s.study_id,s.participant_id)
  JOIN pedpsy.participants p ON (p.study_id,p.id)=(c.study_id,c.participant_id) JOIN pedpsy.studies r ON r.id=c.study_id
  WHERE s.token_hash=current_setting('app.session_hash',true) AND s.revoked_at_ms IS NULL AND s.credential_version=c.version
    AND c.status='active' AND p.status='active' AND r.status='active' AND r.dataset_kind='demo'
    AND extract(epoch FROM clock_timestamp())*1000>=s.last_seen_at_ms
    AND extract(epoch FROM clock_timestamp())*1000<s.expires_at_ms
    AND extract(epoch FROM clock_timestamp())*1000-s.last_seen_at_ms<600000
  UNION ALL
  SELECT c.id,NULL::uuid,NULL::uuid,c.role,c.version,s.expires_at_ms
  FROM pedpsy.staff_sessions s JOIN pedpsy.staff_credentials c ON (c.id,c.user_id,c.role)=(s.credential_id,s.user_id,s.role) JOIN pedpsy.users u ON u.id=c.user_id
  WHERE s.token_hash=current_setting('app.session_hash',true) AND s.revoked_at_ms IS NULL AND s.credential_version=c.version
    AND c.status='active' AND u.status='active' AND s.mfa_verified_at IS NOT NULL AND s.mfa_verified_at<=clock_timestamp()
    AND extract(epoch FROM clock_timestamp())*1000>=s.last_seen_at_ms
    AND extract(epoch FROM clock_timestamp())*1000<s.expires_at_ms
    AND extract(epoch FROM clock_timestamp())*1000-s.last_seen_at_ms<600000
$$;

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
