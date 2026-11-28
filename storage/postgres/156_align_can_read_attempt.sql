SET LOCAL search_path=pedpsy,pg_catalog;
-- 156: two corrections found by auditing the deployed database against a
-- database built from the migration chain.

-- 1. can_read_attempt() kept the body from before migration 129 in the deployed
-- database: a participant could not read their own completed attempt through it.
CREATE OR REPLACE FUNCTION pedpsy.can_read_attempt(attempt uuid) RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path=pg_catalog,pedpsy,pg_temp AS $$
  SELECT pedpsy.owns_active_attempt(attempt)
    OR EXISTS(
      SELECT 1 FROM pedpsy.attempts a
      JOIN pedpsy.stage_enrollments e ON (e.study_id,e.id)=(a.study_id,a.enrollment_id)
      JOIN pedpsy.session_actor() s ON (s.study_id,s.participant_id)=(a.study_id,e.participant_id)
      WHERE a.id=attempt AND s.actor_role='participant' AND a.status='completed')
    OR EXISTS(SELECT 1 FROM pedpsy.session_actor() WHERE actor_role IN ('administrator','superadministrator'))
$$;
REVOKE ALL ON FUNCTION pedpsy.can_read_attempt(uuid) FROM PUBLIC;

-- 2. 153 read the clock once before the query. If the statement then waited for a
-- lock that another transaction released with a fresh last_seen_at_ms, the
-- comparison "now >= last_seen" used a time from before the wait and the session
-- looked like it started in the future: the actor vanished and the request failed
-- with AUTH_REQUIRED. Read the clock inside the statement again; the plan is still
-- prepared once and reused, only the time is not frozen.
CREATE OR REPLACE FUNCTION pedpsy.session_actor()
RETURNS TABLE(credential_id uuid, study_id uuid, participant_id uuid, actor_role text, credential_version integer, expires_at_ms bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE h text;
BEGIN
  h := current_setting('app.session_hash',true);
  IF h IS NULL OR h='' THEN RETURN;END IF;
  RETURN QUERY
    SELECT c.id,c.study_id,c.participant_id,'participant'::text,c.version,s.expires_at_ms
      FROM pedpsy.participant_sessions s
      JOIN pedpsy.participant_credentials c ON (c.id,c.study_id,c.participant_id)=(s.credential_id,s.study_id,s.participant_id)
      JOIN pedpsy.participants p ON (p.study_id,p.id)=(c.study_id,c.participant_id)
      JOIN pedpsy.studies r ON r.id=c.study_id
     WHERE s.token_hash=h AND s.revoked_at_ms IS NULL AND s.credential_version=c.version
       AND c.status='active' AND p.status='active' AND r.status='active' AND r.dataset_kind='demo'
       AND extract(epoch FROM clock_timestamp())*1000>=s.last_seen_at_ms
       AND extract(epoch FROM clock_timestamp())*1000<s.expires_at_ms
       AND extract(epoch FROM clock_timestamp())*1000-s.last_seen_at_ms<600000;
  RETURN QUERY
    SELECT c.id,NULL::uuid,NULL::uuid,c.role,c.version,s.expires_at_ms
      FROM pedpsy.staff_sessions s
      JOIN pedpsy.staff_credentials c ON (c.id,c.user_id,c.role)=(s.credential_id,s.user_id,s.role)
      JOIN pedpsy.users u ON u.id=c.user_id
     WHERE s.token_hash=h AND s.revoked_at_ms IS NULL AND s.credential_version=c.version
       AND c.status='active' AND u.status='active' AND s.mfa_verified_at IS NOT NULL AND s.mfa_verified_at<=clock_timestamp()
       AND extract(epoch FROM clock_timestamp())*1000>=s.last_seen_at_ms
       AND extract(epoch FROM clock_timestamp())*1000<s.expires_at_ms
       AND extract(epoch FROM clock_timestamp())*1000-s.last_seen_at_ms<600000;
END $$;
