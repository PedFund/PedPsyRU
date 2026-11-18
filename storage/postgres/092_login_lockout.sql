SET LOCAL search_path=pedpsy,pg_catalog;
-- 092: escalating lockout after repeated failed logins. The per-attempt window
-- (5 per 15 minutes) stays as is; this adds an identity-level counter over a
-- 24-hour window: 10 failures block for 15 minutes, 20 for one hour, 30 for four
-- hours. Only a hash of the identity is stored; a successful login resets the
-- counter. The table is private: runtime reaches it only through these functions.
CREATE TABLE login_locks(
  bucket_hash text PRIMARY KEY CHECK(bucket_hash ~ '^lock:[a-f0-9]{64}$'),
  window_start_ms bigint NOT NULL CHECK(window_start_ms BETWEEN 0 AND 9007199254740991),
  failures integer NOT NULL CHECK(failures BETWEEN 0 AND 1000000),
  blocked_until_ms bigint NOT NULL DEFAULT 0 CHECK(blocked_until_ms BETWEEN 0 AND 9007199254740991)
);
ALTER TABLE login_locks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON login_locks FROM PUBLIC;
CREATE FUNCTION login_lock_key(scope text,identity text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
  SELECT 'lock:'||encode(sha256(convert_to('pedpsy-login-lock:'||coalesce(scope,'')||':'||coalesce(identity,''),'UTF8')),'hex')
$$;
CREATE FUNCTION login_lock_blocked(scope text,identity text) RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
  SELECT EXISTS(SELECT 1 FROM pedpsy.login_locks WHERE bucket_hash=pedpsy.login_lock_key(scope,identity)
    AND blocked_until_ms>floor(extract(epoch FROM clock_timestamp())*1000)::bigint)
$$;
CREATE FUNCTION login_lock_failure(scope text,identity text) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE at_ms bigint:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;key text:=pedpsy.login_lock_key(scope,identity);
  state record;fails integer;wait_ms bigint;
BEGIN
  SELECT * INTO state FROM pedpsy.login_locks WHERE bucket_hash=key FOR UPDATE;
  IF state.bucket_hash IS NULL OR at_ms-state.window_start_ms>=86400000 THEN
    fails:=1;
    INSERT INTO pedpsy.login_locks(bucket_hash,window_start_ms,failures,blocked_until_ms) VALUES(key,at_ms,fails,0)
      ON CONFLICT(bucket_hash) DO UPDATE SET window_start_ms=at_ms,failures=1,blocked_until_ms=0;
  ELSE
    fails:=state.failures+1;
    UPDATE pedpsy.login_locks SET failures=fails WHERE bucket_hash=key;
  END IF;
  wait_ms:=CASE WHEN fails>=30 THEN 14400000 WHEN fails>=20 THEN 3600000 WHEN fails>=10 THEN 900000 ELSE 0 END;
  IF wait_ms>0 THEN
    UPDATE pedpsy.login_locks SET blocked_until_ms=at_ms+wait_ms WHERE bucket_hash=key;
    IF state.blocked_until_ms IS NULL OR state.blocked_until_ms<=at_ms THEN
      INSERT INTO pedpsy.access_audit_events(id,at_ms,action,outcome,reason)
        VALUES(gen_random_uuid(),at_ms,CASE scope WHEN 'staff' THEN 'staff_login' WHEN 'researcher' THEN 'researcher_login' ELSE 'participant_login' END,'deny','ACCOUNT_LOCKED');
    END IF;
  END IF;
  RETURN fails;
END $$;
CREATE FUNCTION login_lock_success(scope text,identity text) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
  DELETE FROM pedpsy.login_locks WHERE bucket_hash=pedpsy.login_lock_key(scope,identity)
$$;
REVOKE ALL ON FUNCTION login_lock_key(text,text),login_lock_blocked(text,text),login_lock_failure(text,text),login_lock_success(text,text) FROM PUBLIC;
