SET LOCAL search_path=pedpsy,pg_catalog;
-- Backend-only functions. No SQL console, password material or roles in HTTP.
CREATE FUNCTION participant_login_material(code text) RETURNS TABLE(throttled boolean,credential_id uuid,credential_version integer,salt text,password_hash text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE at bigint:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint; bucket text; window_ms bigint; limit_n integer; state record;
BEGIN
  IF code IS NULL OR code !~ '^[A-Z0-9-]{3,80}$' THEN RAISE EXCEPTION 'INVALID_LOGIN' USING ERRCODE='28000'; END IF;
  -- A common bounded admission lock fixes bucket ordering across all logins.
  PERFORM pg_advisory_xact_lock(5151980003);
  FOR bucket,window_ms,limit_n IN SELECT 'global',300000::bigint,30 UNION ALL SELECT code,900000::bigint,5 LOOP
    bucket:='sha256:'||encode(sha256(convert_to('pedpsy-login:'||bucket,'UTF8')),'hex');
    SELECT * INTO state FROM pedpsy.login_throttles WHERE bucket_hash=bucket FOR UPDATE;
    IF FOUND AND at-state.window_start_ms<window_ms AND state.count>=limit_n THEN
      INSERT INTO pedpsy.access_audit_events(id,at_ms,action,outcome,reason) VALUES(gen_random_uuid(),at,'participant_login','deny','LOGIN_THROTTLED');
      RETURN QUERY SELECT true,NULL::uuid,NULL::integer,NULL::text,NULL::text; RETURN;
    END IF;
    INSERT INTO pedpsy.login_throttles(bucket_hash,window_start_ms,count) VALUES(bucket,at,1)
      ON CONFLICT(bucket_hash) DO UPDATE SET window_start_ms=CASE WHEN at-login_throttles.window_start_ms>=window_ms THEN at ELSE login_throttles.window_start_ms END,
      count=CASE WHEN at-login_throttles.window_start_ms>=window_ms THEN 1 ELSE login_throttles.count+1 END;
  END LOOP;
  RETURN QUERY SELECT false,c.id,c.version,c.salt,c.password_hash FROM pedpsy.participant_credentials c
    JOIN pedpsy.participants p ON (p.study_id,p.id)=(c.study_id,c.participant_id) JOIN pedpsy.studies s ON s.id=c.study_id
    WHERE c.login_id=code AND c.status='active' AND p.status='active' AND s.status='active' AND s.dataset_kind='demo';
END $$;
CREATE FUNCTION finish_participant_login(credential uuid,expected_version integer,derived_hash text,session_hash text) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE c record; at bigint:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
BEGIN
  IF session_hash IS NULL OR session_hash !~ '^sha256:[a-f0-9]{64}$' THEN RAISE EXCEPTION 'INVALID_SESSION'; END IF;
  SELECT * INTO c FROM pedpsy.participant_credentials WHERE id=credential FOR UPDATE;
  IF FOUND THEN
    PERFORM 1 FROM pedpsy.studies WHERE id=c.study_id FOR SHARE;
    PERFORM 1 FROM pedpsy.participants WHERE study_id=c.study_id AND id=c.participant_id FOR SHARE;
  END IF;
  IF c.id IS NULL OR c.status<>'active' OR c.version IS DISTINCT FROM expected_version OR c.password_hash IS DISTINCT FROM derived_hash OR NOT EXISTS
    (SELECT 1 FROM pedpsy.studies s JOIN pedpsy.participants p ON p.study_id=s.id WHERE s.id=c.study_id AND p.id=c.participant_id AND s.status='active' AND s.dataset_kind='demo' AND p.status='active') THEN
    INSERT INTO pedpsy.access_audit_events(id,at_ms,action,outcome,reason) VALUES(gen_random_uuid(),at,'participant_login','deny','INVALID_LOGIN'); RETURN NULL;
  END IF;
  UPDATE pedpsy.participant_sessions SET revoked_at_ms=at WHERE credential_id=c.id AND revoked_at_ms IS NULL;
  INSERT INTO pedpsy.participant_sessions(token_hash,credential_id,study_id,participant_id,credential_version,created_at_ms,last_seen_at_ms,expires_at_ms)
    VALUES(session_hash,c.id,c.study_id,c.participant_id,c.version,at,at,at+1800000);
  INSERT INTO pedpsy.access_audit_events(id,at_ms,credential_id,study_id,action,outcome,reason)
    VALUES(gen_random_uuid(),at,c.id,c.study_id,'participant_login','allow','OWN_SCOPE');
  RETURN at+1800000;
END $$;
CREATE FUNCTION lock_participant_identity() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE actor record;
BEGIN
  SELECT * INTO actor FROM pedpsy.session_actor();
  IF NOT FOUND OR actor.actor_role<>'participant' THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE='28000'; END IF;
  PERFORM 1 FROM pedpsy.participant_credentials WHERE id=actor.credential_id FOR SHARE;
  PERFORM 1 FROM pedpsy.participant_sessions WHERE token_hash=current_setting('app.session_hash',true) FOR UPDATE;
  PERFORM 1 FROM pedpsy.studies WHERE id=actor.study_id FOR SHARE;
  PERFORM 1 FROM pedpsy.participants WHERE study_id=actor.study_id AND id=actor.participant_id FOR SHARE;
  IF NOT EXISTS(SELECT 1 FROM pedpsy.session_actor() WHERE actor_role='participant') THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE='28000'; END IF;
END $$;
CREATE FUNCTION logout_participant() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE actor record; at bigint:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
BEGIN
  PERFORM pedpsy.lock_participant_identity(); SELECT * INTO actor FROM pedpsy.session_actor();
  INSERT INTO pedpsy.access_audit_events(id,at_ms,credential_id,study_id,action,outcome,reason)
    VALUES(gen_random_uuid(),at,actor.credential_id,actor.study_id,'participant_logout','allow','OWN_SCOPE');
  UPDATE pedpsy.participant_sessions SET revoked_at_ms=at WHERE token_hash=current_setting('app.session_hash',true);
END $$;
CREATE FUNCTION record_participant_denial(reason_code text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE actor record;
BEGIN
  IF reason_code IS NULL OR reason_code !~ '^[A-Z_]{3,64}$' THEN RAISE EXCEPTION 'INVALID_AUDIT_REASON'; END IF;
  SELECT * INTO actor FROM pedpsy.session_actor() WHERE actor_role='participant';
  INSERT INTO pedpsy.access_audit_events(id,at_ms,credential_id,study_id,action,outcome,reason)
    VALUES(gen_random_uuid(),floor(extract(epoch FROM clock_timestamp())*1000)::bigint,actor.credential_id,actor.study_id,'http_denied','deny',reason_code);
END $$;
REVOKE ALL ON FUNCTION participant_login_material(text),finish_participant_login(uuid,integer,text,text),lock_participant_identity(),logout_participant(),record_participant_denial(text) FROM PUBLIC;
