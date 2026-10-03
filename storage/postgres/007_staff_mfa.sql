SET LOCAL search_path=pedpsy,pg_catalog;
CREATE TABLE staff_mfa_factors (
  credential_id uuid PRIMARY KEY REFERENCES staff_credentials(id), secret_envelope text NOT NULL CHECK(secret_envelope ~ '^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{27}\.[A-Za-z0-9_-]{22}$'),
  enrollment_challenge text NOT NULL REFERENCES staff_login_challenges(token_hash), confirmed_at_ms bigint,
  last_step bigint NOT NULL DEFAULT -1 CHECK(last_step>=-1), created_at_ms bigint NOT NULL
);
CREATE TABLE staff_recovery_codes (
  credential_id uuid NOT NULL REFERENCES staff_credentials(id), code_hash text NOT NULL CHECK(code_hash ~ '^sha256:[a-f0-9]{64}$'),
  used_at_ms bigint, PRIMARY KEY(credential_id,code_hash)
);
CREATE FUNCTION staff_mfa_material(challenge_hash text) RETURNS TABLE(credential_id uuid,secret_envelope text,confirmed boolean,last_step bigint,at_ms bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE a record;
BEGIN
  SELECT * INTO a FROM pedpsy.lock_staff_challenge(challenge_hash);IF NOT FOUND THEN RETURN;END IF;
  RETURN QUERY SELECT a.credential_id,f.secret_envelope,f.confirmed_at_ms IS NOT NULL,f.last_step,floor(extract(epoch FROM clock_timestamp())*1000)::bigint
    FROM pedpsy.staff_mfa_factors f WHERE f.credential_id=a.credential_id;
END $$;
CREATE FUNCTION begin_staff_enrollment(challenge_hash text,sealed text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE a record;f record;at bigint;
BEGIN
  SELECT * INTO a FROM pedpsy.lock_staff_challenge(challenge_hash);
  IF NOT FOUND THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE='28000';END IF;
  SELECT * INTO f FROM pedpsy.staff_mfa_factors WHERE credential_id=a.credential_id FOR UPDATE;
  IF f.confirmed_at_ms IS NOT NULL THEN RAISE EXCEPTION 'MFA_ALREADY_ENROLLED' USING ERRCODE='42501';END IF;
  IF f.enrollment_challenge=challenge_hash THEN RETURN NULL;END IF;
  at:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
  INSERT INTO pedpsy.staff_mfa_factors(credential_id,secret_envelope,enrollment_challenge,created_at_ms) VALUES(a.credential_id,sealed,challenge_hash,at)
    ON CONFLICT(credential_id) DO UPDATE SET secret_envelope=sealed,enrollment_challenge=challenge_hash,created_at_ms=at;
  INSERT INTO pedpsy.access_audit_events(id,at_ms,credential_id,action,outcome,reason,actor_role)
    VALUES(gen_random_uuid(),at,a.credential_id,'mfa_enrollment','allow','PENDING_CONFIRMATION',a.actor_role);
  RETURN a.credential_id;
END $$;
CREATE FUNCTION staff_challenge_identity(challenge_hash text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE a record;
BEGIN SELECT * INTO a FROM pedpsy.lock_staff_challenge(challenge_hash);RETURN a.credential_id;END $$;
CREATE FUNCTION finish_staff_mfa(challenge_hash text,verified_step bigint,recovery_hash text,session_hash text,new_codes text[]) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE a record;f record;at bigint;step bigint;valid boolean:=false;code text;
BEGIN
  IF session_hash IS NULL OR session_hash !~ '^sha256:[a-f0-9]{64}$' THEN RAISE EXCEPTION 'INVALID_SESSION';END IF;
  SELECT * INTO a FROM pedpsy.lock_staff_challenge(challenge_hash);
  IF NOT FOUND THEN
    INSERT INTO pedpsy.access_audit_events(id,at_ms,action,outcome,reason) VALUES(gen_random_uuid(),floor(extract(epoch FROM clock_timestamp())*1000)::bigint,'staff_mfa','deny','INVALID_MFA');RETURN NULL;
  END IF;
  SELECT * INTO f FROM pedpsy.staff_mfa_factors WHERE credential_id=a.credential_id FOR UPDATE;
  at:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;step:=at/30000;
  IF f.credential_id IS NOT NULL AND verified_step IS NOT NULL AND verified_step BETWEEN step-1 AND step+1 AND verified_step>f.last_step
    AND (f.confirmed_at_ms IS NOT NULL OR f.enrollment_challenge=challenge_hash) THEN
    valid:=true;
    IF f.confirmed_at_ms IS NULL THEN
      IF array_length(new_codes,1) IS DISTINCT FROM 8 OR (SELECT count(DISTINCT x) FROM unnest(new_codes) x)<>8
        OR EXISTS(SELECT 1 FROM unnest(new_codes) x WHERE x IS NULL OR x !~ '^sha256:[a-f0-9]{64}$') THEN RAISE EXCEPTION 'INVALID_RECOVERY_SET';END IF;
      FOREACH code IN ARRAY new_codes LOOP INSERT INTO pedpsy.staff_recovery_codes(credential_id,code_hash) VALUES(a.credential_id,code);END LOOP;
    END IF;
    UPDATE pedpsy.staff_mfa_factors SET confirmed_at_ms=coalesce(confirmed_at_ms,at),last_step=verified_step WHERE credential_id=a.credential_id;
  ELSIF f.confirmed_at_ms IS NOT NULL AND recovery_hash IS NOT NULL THEN
    UPDATE pedpsy.staff_recovery_codes SET used_at_ms=at WHERE credential_id=a.credential_id AND code_hash=recovery_hash AND used_at_ms IS NULL;
    valid:=FOUND;
  END IF;
  IF NOT valid THEN
    UPDATE pedpsy.staff_login_challenges SET failed_attempts=failed_attempts+1 WHERE token_hash=challenge_hash;
    INSERT INTO pedpsy.access_audit_events(id,at_ms,credential_id,action,outcome,reason,actor_role) VALUES(gen_random_uuid(),at,a.credential_id,'staff_mfa','deny','INVALID_MFA',a.actor_role);RETURN NULL;
  END IF;
  UPDATE pedpsy.staff_login_challenges SET used_at_ms=at WHERE token_hash=challenge_hash;
  UPDATE pedpsy.staff_sessions SET revoked_at_ms=at WHERE credential_id=a.credential_id AND revoked_at_ms IS NULL;
  INSERT INTO pedpsy.staff_sessions(token_hash,credential_id,user_id,role,credential_version,created_at_ms,last_seen_at_ms,expires_at_ms,mfa_verified_at)
    VALUES(session_hash,a.credential_id,a.user_id,a.actor_role,a.credential_version,at,at,at+1800000,to_timestamp(at/1000.0));
  INSERT INTO pedpsy.access_audit_events(id,at_ms,credential_id,action,outcome,reason,actor_role)
    VALUES(gen_random_uuid(),at,a.credential_id,'staff_mfa','allow',CASE WHEN recovery_hash IS NULL THEN 'TOTP_VERIFIED' ELSE 'RECOVERY_USED' END,a.actor_role);
  RETURN at+1800000;
END $$;
CREATE FUNCTION lock_staff_identity() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE a record;
BEGIN
  SELECT * INTO a FROM pedpsy.account_actor();
  IF NOT FOUND OR a.actor_role NOT IN ('administrator','superadministrator') THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE='28000';END IF;
  PERFORM 1 FROM pedpsy.staff_credentials WHERE id=a.credential_id FOR SHARE;
  PERFORM 1 FROM pedpsy.users WHERE id=a.user_id FOR SHARE;
  PERFORM 1 FROM pedpsy.staff_sessions WHERE token_hash=current_setting('app.session_hash',true) FOR UPDATE;
  IF NOT EXISTS(SELECT 1 FROM pedpsy.account_actor() WHERE actor_role IN ('administrator','superadministrator')) THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE='28000';END IF;
END $$;
CREATE FUNCTION touch_staff_identity() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
BEGIN
  PERFORM pedpsy.lock_staff_identity();
  UPDATE pedpsy.staff_sessions SET last_seen_at_ms=floor(extract(epoch FROM clock_timestamp())*1000)::bigint WHERE token_hash=current_setting('app.session_hash',true);
END $$;
CREATE FUNCTION logout_staff() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
BEGIN
  PERFORM pedpsy.lock_staff_identity();PERFORM pedpsy.record_account_check('staff.logout',true,'CURRENT_IDENTITY');
  UPDATE pedpsy.staff_sessions SET revoked_at_ms=floor(extract(epoch FROM clock_timestamp())*1000)::bigint WHERE token_hash=current_setting('app.session_hash',true);
END $$;
REVOKE ALL ON staff_mfa_factors,staff_recovery_codes FROM PUBLIC;
REVOKE ALL ON FUNCTION staff_mfa_material(text),begin_staff_enrollment(text,text),staff_challenge_identity(text),finish_staff_mfa(text,bigint,text,text,text[]),lock_staff_identity(),touch_staff_identity(),logout_staff() FROM PUBLIC;
