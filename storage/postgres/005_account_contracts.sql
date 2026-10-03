SET LOCAL search_path=pedpsy,pg_catalog;
-- Researcher identity is separate from participant and staff capabilities.
CREATE TABLE researcher_credentials (
  id uuid PRIMARY KEY, user_id uuid NOT NULL UNIQUE REFERENCES users(id),
  login_id text NOT NULL UNIQUE CHECK(login_id ~ '^[A-Z0-9][A-Z0-9._-]{2,79}$'),
  scheme text NOT NULL CHECK(scheme='scrypt-N131072-r8-p1-dk64'),
  salt text NOT NULL CHECK(salt ~ '^[a-f0-9]{32}$'), password_hash text NOT NULL CHECK(password_hash ~ '^[a-f0-9]{128}$'),
  version integer NOT NULL DEFAULT 1 CHECK(version>=1), status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','revoked')),
  active_study_quota integer NOT NULL DEFAULT 1 CHECK(active_study_quota BETWEEN 1 AND 100),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(id,user_id)
);
CREATE TABLE researcher_sessions (
  token_hash text PRIMARY KEY CHECK(token_hash ~ '^sha256:[a-f0-9]{64}$'), credential_id uuid NOT NULL, user_id uuid NOT NULL,
  credential_version integer NOT NULL CHECK(credential_version>=1), created_at_ms bigint NOT NULL, last_seen_at_ms bigint NOT NULL,
  expires_at_ms bigint NOT NULL CHECK(expires_at_ms>created_at_ms), revoked_at_ms bigint,
  CHECK(last_seen_at_ms>=created_at_ms AND last_seen_at_ms<=expires_at_ms),
  FOREIGN KEY(credential_id,user_id) REFERENCES researcher_credentials(id,user_id)
);
CREATE INDEX researcher_sessions_credential ON researcher_sessions(credential_id,user_id);
CREATE INDEX membership_user_scope ON study_memberships(user_id,study_id,role,status);
CREATE FUNCTION guard_researcher_credential() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,pedpsy AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'revoke credentials instead' USING ERRCODE='23514'; END IF;
  IF (NEW.id,NEW.user_id,NEW.login_id,NEW.scheme) IS DISTINCT FROM (OLD.id,OLD.user_id,OLD.login_id,OLD.scheme)
    THEN RAISE EXCEPTION 'researcher scope is frozen' USING ERRCODE='23514'; END IF;
  IF NEW.version<OLD.version OR ((NEW.salt,NEW.password_hash,NEW.status) IS DISTINCT FROM (OLD.salt,OLD.password_hash,OLD.status) AND NEW.version<=OLD.version)
    THEN RAISE EXCEPTION 'credential change requires version increment' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER researcher_credential_guard BEFORE UPDATE OR DELETE ON researcher_credentials FOR EACH ROW EXECUTE FUNCTION guard_researcher_credential();
CREATE FUNCTION account_actor() RETURNS TABLE(credential_id uuid,user_id uuid,actor_role text,credential_version integer,expires_at_ms bigint,mfa_verified_at_ms bigint)
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
  SELECT c.id,c.user_id,c.role,c.version,s.expires_at_ms,floor(extract(epoch FROM s.mfa_verified_at)*1000)::bigint
  FROM pedpsy.staff_sessions s JOIN pedpsy.staff_credentials c ON (c.id,c.user_id,c.role)=(s.credential_id,s.user_id,s.role) JOIN pedpsy.users u ON u.id=c.user_id
  WHERE s.token_hash=current_setting('app.session_hash',true) AND s.revoked_at_ms IS NULL AND s.credential_version=c.version
    AND c.status='active' AND u.status='active' AND s.mfa_verified_at IS NOT NULL AND s.mfa_verified_at<=clock_timestamp()
    AND extract(epoch FROM clock_timestamp())*1000>=s.last_seen_at_ms AND extract(epoch FROM clock_timestamp())*1000<s.expires_at_ms
    AND extract(epoch FROM clock_timestamp())*1000-s.last_seen_at_ms<600000
  UNION ALL
  SELECT c.id,c.user_id,'researcher'::text,c.version,s.expires_at_ms,NULL::bigint
  FROM pedpsy.researcher_sessions s JOIN pedpsy.researcher_credentials c ON (c.id,c.user_id)=(s.credential_id,s.user_id) JOIN pedpsy.users u ON u.id=c.user_id
  WHERE s.token_hash=current_setting('app.session_hash',true) AND s.revoked_at_ms IS NULL AND s.credential_version=c.version
    AND c.status='active' AND u.status='active'
    AND extract(epoch FROM clock_timestamp())*1000>=s.last_seen_at_ms AND extract(epoch FROM clock_timestamp())*1000<s.expires_at_ms
    AND extract(epoch FROM clock_timestamp())*1000-s.last_seen_at_ms<600000
$$;
CREATE FUNCTION account_owns_study(study uuid) RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
  SELECT EXISTS(SELECT 1 FROM pedpsy.account_actor() a JOIN pedpsy.study_memberships m ON m.user_id=a.user_id
    JOIN pedpsy.studies s ON s.id=m.study_id WHERE a.actor_role='researcher' AND m.role='researcher' AND m.status='active'
    AND m.study_id=study AND s.dataset_kind='demo' AND s.status IN ('draft','active','closed'))
$$;
CREATE FUNCTION record_account_check(operation text,allowed boolean,reason_code text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE a record;
BEGIN
  IF operation !~ '^[a-z._]{3,64}$' OR reason_code !~ '^[A-Z_]{3,64}$' THEN RAISE EXCEPTION 'INVALID_AUDIT' USING ERRCODE='22023'; END IF;
  SELECT * INTO a FROM pedpsy.account_actor();
  INSERT INTO pedpsy.access_audit_events(id,at_ms,credential_id,action,outcome,reason,actor_role)
  VALUES(gen_random_uuid(),floor(extract(epoch FROM clock_timestamp())*1000)::bigint,a.credential_id,operation,
    CASE WHEN allowed THEN 'allow' ELSE 'deny' END,reason_code,CASE WHEN a.actor_role IN ('administrator','superadministrator') THEN a.actor_role ELSE NULL END);
END $$;
REVOKE ALL ON researcher_credentials,researcher_sessions FROM PUBLIC;
REVOKE ALL ON FUNCTION guard_researcher_credential(),account_actor(),account_owns_study(uuid),record_account_check(text,boolean,text) FROM PUBLIC;
