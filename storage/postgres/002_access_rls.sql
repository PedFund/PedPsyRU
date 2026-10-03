SET LOCAL search_path=pedpsy,pg_catalog;
CREATE TABLE participant_credentials (
  id uuid PRIMARY KEY, study_id uuid NOT NULL, participant_id uuid NOT NULL, login_id text NOT NULL UNIQUE CHECK(length(login_id) BETWEEN 3 AND 80),
  scheme text NOT NULL CHECK(scheme='scrypt-N131072-r8-p1-dk64'), salt text NOT NULL CHECK(salt ~ '^[a-f0-9]{32}$'),
  password_hash text NOT NULL CHECK(password_hash ~ '^[a-f0-9]{128}$'), version integer NOT NULL DEFAULT 1 CHECK(version>=1),
  status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','revoked')), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(study_id,participant_id), UNIQUE(id,study_id,participant_id), FOREIGN KEY(study_id,participant_id) REFERENCES participants(study_id,id)
);
CREATE TABLE participant_sessions (
  token_hash text PRIMARY KEY CHECK(token_hash ~ '^sha256:[a-f0-9]{64}$'), credential_id uuid NOT NULL, study_id uuid NOT NULL, participant_id uuid NOT NULL,
  credential_version integer NOT NULL CHECK(credential_version>=1), created_at_ms bigint NOT NULL, last_seen_at_ms bigint NOT NULL,
  expires_at_ms bigint NOT NULL CHECK(expires_at_ms>created_at_ms), revoked_at_ms bigint,
  CHECK(last_seen_at_ms>=created_at_ms AND last_seen_at_ms<=expires_at_ms),
  FOREIGN KEY(credential_id,study_id,participant_id) REFERENCES participant_credentials(id,study_id,participant_id)
);
CREATE TABLE staff_credentials (
  id uuid PRIMARY KEY, user_id uuid NOT NULL UNIQUE REFERENCES users(id), login_id text NOT NULL UNIQUE CHECK(length(login_id) BETWEEN 3 AND 80),
  role text NOT NULL CHECK(role IN ('administrator','superadministrator')), scheme text NOT NULL CHECK(scheme='scrypt-N131072-r8-p1-dk64'),
  salt text NOT NULL CHECK(salt ~ '^[a-f0-9]{32}$'), password_hash text NOT NULL CHECK(password_hash ~ '^[a-f0-9]{128}$'),
  version integer NOT NULL DEFAULT 1 CHECK(version>=1), status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','revoked')),
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(id,user_id,role)
);
CREATE TABLE staff_sessions (
  token_hash text PRIMARY KEY CHECK(token_hash ~ '^sha256:[a-f0-9]{64}$'), credential_id uuid NOT NULL, user_id uuid NOT NULL, role text NOT NULL,
  credential_version integer NOT NULL CHECK(credential_version>=1), created_at_ms bigint NOT NULL, last_seen_at_ms bigint NOT NULL,
  expires_at_ms bigint NOT NULL CHECK(expires_at_ms>created_at_ms), revoked_at_ms bigint, mfa_verified_at timestamptz,
  CHECK(last_seen_at_ms>=created_at_ms AND last_seen_at_ms<=expires_at_ms),
  CHECK(mfa_verified_at IS NULL OR (mfa_verified_at>=to_timestamp(created_at_ms/1000.0) AND mfa_verified_at<=to_timestamp(expires_at_ms/1000.0))),
  FOREIGN KEY(credential_id,user_id,role) REFERENCES staff_credentials(id,user_id,role)
);
CREATE TABLE login_throttles (bucket_hash text PRIMARY KEY CHECK(bucket_hash ~ '^sha256:[a-f0-9]{64}$'), window_start_ms bigint NOT NULL, count integer NOT NULL CHECK(count>=1));
CREATE TABLE access_audit_events (
  id uuid PRIMARY KEY, at_ms bigint NOT NULL, credential_id uuid, study_id uuid, action text NOT NULL,
  outcome text NOT NULL CHECK(outcome IN ('allow','deny')), reason text NOT NULL,
  actor_role text CHECK(actor_role IS NULL OR actor_role IN ('administrator','superadministrator')), resource_id uuid,
  record_count integer CHECK(record_count IS NULL OR record_count>=0)
);
CREATE INDEX sessions_credential ON participant_sessions(credential_id,study_id,participant_id);
CREATE INDEX staff_sessions_credential ON staff_sessions(credential_id,user_id,role);
CREATE INDEX audit_study_at ON access_audit_events(study_id,at_ms);
CREATE TRIGGER audit_immutable BEFORE UPDATE OR DELETE ON access_audit_events FOR EACH ROW EXECUTE FUNCTION immutable_row();
CREATE FUNCTION guard_credential() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,pedpsy AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'revoke credentials instead' USING ERRCODE='23514'; END IF;
  IF TG_TABLE_NAME='participant_credentials' THEN
    IF (NEW.id,NEW.study_id,NEW.participant_id,NEW.login_id) IS DISTINCT FROM (OLD.id,OLD.study_id,OLD.participant_id,OLD.login_id)
      THEN RAISE EXCEPTION 'credential scope is frozen' USING ERRCODE='23514'; END IF;
  ELSE
    IF (NEW.id,NEW.user_id,NEW.login_id,NEW.role) IS DISTINCT FROM (OLD.id,OLD.user_id,OLD.login_id,OLD.role)
      THEN RAISE EXCEPTION 'staff scope is frozen' USING ERRCODE='23514'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER credential_guard BEFORE UPDATE OR DELETE ON participant_credentials FOR EACH ROW EXECUTE FUNCTION guard_credential();
CREATE TRIGGER staff_credential_guard BEFORE UPDATE OR DELETE ON staff_credentials FOR EACH ROW EXECUTE FUNCTION guard_credential();

-- Private authorization lookup: no runtime SELECT on sessions/hashes/passwords.
-- Hash acts as the opaque session capability. Client role/scope GUCs are ignored.
CREATE FUNCTION session_actor() RETURNS TABLE(credential_id uuid, study_id uuid, participant_id uuid, actor_role text, credential_version integer, expires_at_ms bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
  SELECT c.id,c.study_id,c.participant_id,'participant'::text,c.version,s.expires_at_ms
  FROM pedpsy.participant_sessions s JOIN pedpsy.participant_credentials c ON (c.id,c.study_id,c.participant_id)=(s.credential_id,s.study_id,s.participant_id)
  JOIN pedpsy.participants p ON (p.study_id,p.id)=(c.study_id,c.participant_id) JOIN pedpsy.studies r ON r.id=c.study_id
  WHERE s.token_hash=current_setting('app.session_hash',true) AND s.revoked_at_ms IS NULL AND s.credential_version=c.version
    AND c.status='active' AND p.status='active' AND r.status='active' AND r.dataset_kind='demo'
    AND extract(epoch FROM statement_timestamp())*1000>=s.last_seen_at_ms
    AND extract(epoch FROM statement_timestamp())*1000<s.expires_at_ms
    AND extract(epoch FROM statement_timestamp())*1000-s.last_seen_at_ms<600000
  UNION ALL
  SELECT c.id,NULL::uuid,NULL::uuid,c.role,c.version,s.expires_at_ms
  FROM pedpsy.staff_sessions s JOIN pedpsy.staff_credentials c ON (c.id,c.user_id,c.role)=(s.credential_id,s.user_id,s.role) JOIN pedpsy.users u ON u.id=c.user_id
  WHERE s.token_hash=current_setting('app.session_hash',true) AND s.revoked_at_ms IS NULL AND s.credential_version=c.version
    AND c.status='active' AND u.status='active' AND s.mfa_verified_at IS NOT NULL AND s.mfa_verified_at<=statement_timestamp()
    AND extract(epoch FROM statement_timestamp())*1000>=s.last_seen_at_ms
    AND extract(epoch FROM statement_timestamp())*1000<s.expires_at_ms
    AND extract(epoch FROM statement_timestamp())*1000-s.last_seen_at_ms<600000
$$;
CREATE FUNCTION owns_active_attempt(attempt uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
  SELECT EXISTS(SELECT 1 FROM pedpsy.attempts a JOIN pedpsy.stage_enrollments e ON (e.study_id,e.id)=(a.study_id,a.enrollment_id)
    JOIN pedpsy.assignments x ON (x.study_id,x.id)=(a.study_id,a.assignment_id) JOIN pedpsy.research_groups g ON (g.study_id,g.id)=(a.study_id,a.group_id)
    JOIN pedpsy.research_stages t ON (t.study_id,t.id)=(a.study_id,a.stage_id) JOIN pedpsy.session_actor() s ON (s.study_id,s.participant_id)=(a.study_id,e.participant_id)
    WHERE a.id=attempt AND s.actor_role='participant' AND e.status='active' AND x.status='active' AND g.status='active' AND t.status='active')
$$;
CREATE FUNCTION can_read_attempt(attempt uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
  SELECT pedpsy.owns_active_attempt(attempt) OR EXISTS(SELECT 1 FROM pedpsy.session_actor() WHERE actor_role IN ('administrator','superadministrator'))
$$;
CREATE FUNCTION can_read_release(release uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
  SELECT EXISTS(SELECT 1 FROM pedpsy.attempts WHERE release_id=release AND pedpsy.can_read_attempt(id))
$$;
CREATE FUNCTION touch_session() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM pedpsy.session_actor()) THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE='28000'; END IF;
  UPDATE pedpsy.participant_sessions SET last_seen_at_ms=floor(extract(epoch FROM statement_timestamp())*1000)::bigint WHERE token_hash=current_setting('app.session_hash',true);
END $$;

-- Owner is the separately privileged migrator, never runtime. Owner bypass is
-- deliberately confined to fixed SECURITY DEFINER authorization functions;
-- this also works on managed PostgreSQL without granting BYPASSRLS/superuser.
ALTER TABLE attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY attempt_read ON attempts FOR SELECT USING(pedpsy.can_read_attempt(id));
CREATE POLICY attempt_update ON attempts FOR UPDATE USING(status='draft' AND pedpsy.owns_active_attempt(id)) WITH CHECK(pedpsy.owns_active_attempt(id));
ALTER TABLE responses ENABLE ROW LEVEL SECURITY;
CREATE POLICY response_read ON responses FOR SELECT USING(pedpsy.can_read_attempt(attempt_id));
CREATE POLICY response_insert ON responses FOR INSERT WITH CHECK(pedpsy.owns_active_attempt(attempt_id));
CREATE POLICY response_delete ON responses FOR DELETE USING(pedpsy.owns_active_attempt(attempt_id));
ALTER TABLE attempt_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY result_read ON attempt_results FOR SELECT USING(pedpsy.can_read_attempt(attempt_id));
CREATE POLICY result_insert ON attempt_results FOR INSERT WITH CHECK(pedpsy.owns_active_attempt(attempt_id));
ALTER TABLE instrument_releases ENABLE ROW LEVEL SECURITY;
CREATE POLICY release_read ON instrument_releases FOR SELECT USING(pedpsy.can_read_release(id));
ALTER TABLE release_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY item_read ON release_items FOR SELECT USING(pedpsy.can_read_release(release_id));
ALTER TABLE access_audit_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY audit_insert ON access_audit_events FOR INSERT WITH CHECK(EXISTS(
  SELECT 1 FROM pedpsy.session_actor() s WHERE s.credential_id=access_audit_events.credential_id
    AND (s.study_id=access_audit_events.study_id AND access_audit_events.actor_role IS NULL OR s.actor_role=access_audit_events.actor_role)
    AND (resource_id IS NULL OR pedpsy.can_read_attempt(resource_id))));
REVOKE ALL ON ALL TABLES IN SCHEMA pedpsy FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA pedpsy FROM PUBLIC;
-- Runtime grants are applied explicitly by migrate.ts to a separately provisioned role.
