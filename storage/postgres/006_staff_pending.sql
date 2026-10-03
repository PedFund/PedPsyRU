SET LOCAL search_path=pedpsy,pg_catalog;
CREATE TABLE staff_login_challenges (
  token_hash text PRIMARY KEY CHECK(token_hash ~ '^sha256:[a-f0-9]{64}$'),
  credential_id uuid NOT NULL REFERENCES staff_credentials(id), credential_version integer NOT NULL CHECK(credential_version>=1),
  created_at_ms bigint NOT NULL, expires_at_ms bigint NOT NULL CHECK(expires_at_ms>created_at_ms AND expires_at_ms-created_at_ms<=300000),
  failed_attempts integer NOT NULL DEFAULT 0 CHECK(failed_attempts BETWEEN 0 AND 5), used_at_ms bigint
);
CREATE INDEX staff_challenges_credential ON staff_login_challenges(credential_id);
CREATE FUNCTION guard_staff_version() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,pedpsy AS $$
BEGIN
  IF NEW.version<OLD.version OR ((NEW.salt,NEW.password_hash,NEW.status,NEW.role) IS DISTINCT FROM (OLD.salt,OLD.password_hash,OLD.status,OLD.role) AND NEW.version<=OLD.version)
    THEN RAISE EXCEPTION 'credential change requires version increment' USING ERRCODE='23514'; END IF;
  IF NEW.version>OLD.version THEN
    UPDATE pedpsy.staff_sessions SET revoked_at_ms=floor(extract(epoch FROM clock_timestamp())*1000)::bigint WHERE credential_id=OLD.id AND revoked_at_ms IS NULL;
    UPDATE pedpsy.staff_login_challenges SET used_at_ms=floor(extract(epoch FROM clock_timestamp())*1000)::bigint WHERE credential_id=OLD.id AND used_at_ms IS NULL;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER staff_version_guard BEFORE UPDATE ON staff_credentials FOR EACH ROW EXECUTE FUNCTION guard_staff_version();
CREATE FUNCTION staff_login_material(code text) RETURNS TABLE(throttled boolean,credential_id uuid,credential_version integer,salt text,password_hash text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE at bigint:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint; bucket text; window_ms bigint; limit_n integer; state record;
BEGIN
  IF code IS NULL OR code !~ '^[A-Z0-9-]{3,80}$' THEN RAISE EXCEPTION 'INVALID_LOGIN' USING ERRCODE='28000'; END IF;
  PERFORM pg_advisory_xact_lock(5151980004);
  FOR bucket,window_ms,limit_n IN SELECT 'global',300000::bigint,30 UNION ALL SELECT code,900000::bigint,5 LOOP
    bucket:='sha256:'||encode(sha256(convert_to('pedpsy-staff-login:'||bucket,'UTF8')),'hex');
    SELECT * INTO state FROM pedpsy.login_throttles WHERE bucket_hash=bucket FOR UPDATE;
    IF FOUND AND at-state.window_start_ms<window_ms AND state.count>=limit_n THEN
      INSERT INTO pedpsy.access_audit_events(id,at_ms,action,outcome,reason) VALUES(gen_random_uuid(),at,'staff_login','deny','LOGIN_THROTTLED');
      RETURN QUERY SELECT true,NULL::uuid,NULL::integer,NULL::text,NULL::text; RETURN;
    END IF;
    INSERT INTO pedpsy.login_throttles(bucket_hash,window_start_ms,count) VALUES(bucket,at,1)
      ON CONFLICT(bucket_hash) DO UPDATE SET window_start_ms=CASE WHEN at-login_throttles.window_start_ms>=window_ms THEN at ELSE login_throttles.window_start_ms END,
      count=CASE WHEN at-login_throttles.window_start_ms>=window_ms THEN 1 ELSE login_throttles.count+1 END;
  END LOOP;
  RETURN QUERY SELECT false,c.id,c.version,c.salt,c.password_hash FROM pedpsy.staff_credentials c JOIN pedpsy.users u ON u.id=c.user_id
    WHERE c.login_id=code AND c.status='active' AND u.status='active';
END $$;
CREATE FUNCTION finish_staff_password(credential uuid,expected_version integer,derived_hash text,challenge_hash text) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE c record; at bigint;
BEGIN
  IF challenge_hash IS NULL OR challenge_hash !~ '^sha256:[a-f0-9]{64}$' THEN RAISE EXCEPTION 'INVALID_CHALLENGE'; END IF;
  SELECT * INTO c FROM pedpsy.staff_credentials WHERE id=credential FOR UPDATE;
  IF FOUND THEN PERFORM 1 FROM pedpsy.users WHERE id=c.user_id FOR SHARE; END IF;
  at:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
  IF c.id IS NULL OR c.status<>'active' OR c.version IS DISTINCT FROM expected_version OR c.password_hash IS DISTINCT FROM derived_hash
    OR NOT EXISTS(SELECT 1 FROM pedpsy.users WHERE id=c.user_id AND status='active') THEN
    INSERT INTO pedpsy.access_audit_events(id,at_ms,action,outcome,reason) VALUES(gen_random_uuid(),at,'staff_login','deny','INVALID_LOGIN'); RETURN NULL;
  END IF;
  UPDATE pedpsy.staff_login_challenges SET used_at_ms=at WHERE credential_id=c.id AND used_at_ms IS NULL;
  INSERT INTO pedpsy.staff_login_challenges(token_hash,credential_id,credential_version,created_at_ms,expires_at_ms)
    VALUES(challenge_hash,c.id,c.version,at,at+300000);
  INSERT INTO pedpsy.access_audit_events(id,at_ms,credential_id,action,outcome,reason,actor_role)
    VALUES(gen_random_uuid(),at,c.id,'staff_password','allow','MFA_PENDING',c.role);
  RETURN at+300000;
END $$;
-- Acquire in credential -> user -> challenge order, repeat wall-clock checks.
CREATE FUNCTION lock_staff_challenge(challenge_hash text) RETURNS TABLE(credential_id uuid,user_id uuid,actor_role text,credential_version integer,expires_at_ms bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE challenge record; c record; at bigint;
BEGIN
  SELECT * INTO challenge FROM pedpsy.staff_login_challenges WHERE token_hash=challenge_hash;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT * INTO c FROM pedpsy.staff_credentials WHERE id=challenge.credential_id FOR UPDATE;
  PERFORM 1 FROM pedpsy.users WHERE id=c.user_id FOR SHARE;
  SELECT * INTO challenge FROM pedpsy.staff_login_challenges WHERE token_hash=challenge_hash FOR UPDATE;
  at:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
  IF challenge.used_at_ms IS NOT NULL OR challenge.failed_attempts>=5 OR at>=challenge.expires_at_ms OR at<challenge.created_at_ms
    OR challenge.credential_version<>c.version OR c.status<>'active' OR NOT EXISTS(SELECT 1 FROM pedpsy.users WHERE id=c.user_id AND status='active') THEN RETURN; END IF;
  RETURN QUERY SELECT c.id,c.user_id,c.role,c.version,challenge.expires_at_ms;
END $$;
REVOKE ALL ON staff_login_challenges FROM PUBLIC;
REVOKE ALL ON FUNCTION guard_staff_version(),staff_login_material(text),finish_staff_password(uuid,integer,text,text),lock_staff_challenge(text) FROM PUBLIC;
