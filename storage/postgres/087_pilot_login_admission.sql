SET LOCAL search_path=pedpsy,pg_catalog;
-- 087: pilot admission for participant onboarding. The historical functions
-- stay untouched and keep their 30 attempts / 5 minutes default. These explicit
-- v2 variants accept a bounded global policy from the application; per-code,
-- per-email and per-browser limits remain unchanged. No data is rewritten.
CREATE FUNCTION participant_login_material_v2(code text,global_limit integer,global_window_ms bigint)
RETURNS TABLE(throttled boolean,credential_id uuid,credential_version integer,salt text,password_hash text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE at bigint:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;bucket text;window_ms bigint;limit_n integer;state record;
BEGIN
  IF global_limit IS NULL OR global_limit<1 OR global_limit>1200 OR global_window_ms IS NULL OR global_window_ms<300000 OR global_window_ms>3600000
    THEN RAISE EXCEPTION 'INVALID_LOGIN_POLICY' USING ERRCODE='22023';END IF;
  IF code IS NULL OR code !~ '^[A-Z0-9-]{3,80}$' THEN RAISE EXCEPTION 'INVALID_LOGIN' USING ERRCODE='28000';END IF;
  PERFORM pg_advisory_xact_lock(5151980003);
  FOR bucket,window_ms,limit_n IN SELECT 'global',global_window_ms,global_limit UNION ALL SELECT code,900000::bigint,5 LOOP
    bucket:='sha256:'||encode(sha256(convert_to('pedpsy-login:'||bucket,'UTF8')),'hex');
    SELECT * INTO state FROM pedpsy.login_throttles WHERE bucket_hash=bucket FOR UPDATE;
    IF FOUND AND at-state.window_start_ms<window_ms AND state.count>=limit_n THEN
      INSERT INTO pedpsy.access_audit_events(id,at_ms,action,outcome,reason) VALUES(gen_random_uuid(),at,'participant_login','deny','LOGIN_THROTTLED');
      RETURN QUERY SELECT true,NULL::uuid,NULL::integer,NULL::text,NULL::text;RETURN;
    END IF;
    INSERT INTO pedpsy.login_throttles(bucket_hash,window_start_ms,count) VALUES(bucket,at,1)
      ON CONFLICT(bucket_hash) DO UPDATE SET window_start_ms=CASE WHEN at-login_throttles.window_start_ms>=window_ms THEN at ELSE login_throttles.window_start_ms END,
      count=CASE WHEN at-login_throttles.window_start_ms>=window_ms THEN 1 ELSE login_throttles.count+1 END;
  END LOOP;
  RETURN QUERY SELECT false,c.id,c.version,c.salt,c.password_hash FROM pedpsy.participant_credentials c
    JOIN pedpsy.participants p ON (p.study_id,p.id)=(c.study_id,c.participant_id) JOIN pedpsy.studies s ON s.id=c.study_id
    WHERE c.login_id=code AND c.status='active' AND p.status='active' AND s.status='active' AND s.dataset_kind='demo'
      AND NOT EXISTS(SELECT 1 FROM pedpsy.participant_contacts contact WHERE contact.study_id=c.study_id AND contact.participant_id=c.participant_id);
END $$;

CREATE FUNCTION participant_email_login_material_v2(target_study uuid,email text,allow_real_email boolean,global_limit integer,global_window_ms bigint)
RETURNS TABLE(throttled boolean,credential_id uuid,credential_version integer,salt text,password_hash text,contact_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE at_ms bigint:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;bucket text;window_ms bigint;limit_n integer;throttle record;c record;contact record;
BEGIN
  IF global_limit IS NULL OR global_limit<1 OR global_limit>1200 OR global_window_ms IS NULL OR global_window_ms<300000 OR global_window_ms>3600000
    THEN RAISE EXCEPTION 'INVALID_LOGIN_POLICY' USING ERRCODE='22023';END IF;
  IF target_study IS NULL OR email IS NULL OR allow_real_email IS NULL OR length(email) NOT BETWEEN 3 AND 254
    OR (allow_real_email AND email !~ '^[A-Za-z0-9!#$%&''*+/=?^_`{|}~-]+([.][A-Za-z0-9!#$%&''*+/=?^_`{|}~-]+)*@[^@[:space:]]+$')
    OR (NOT allow_real_email AND email !~ '^[A-Za-z0-9!#$%&''*+/=?^_`{|}~-]+([.][A-Za-z0-9!#$%&''*+/=?^_`{|}~-]+)*@example[.]test$')
    THEN RAISE EXCEPTION 'INVALID_REGISTRATION_INPUT' USING ERRCODE='22023';END IF;
  -- Same bounded admission lock/global bucket as existing participant code
  -- login. A known credential also shares its old per-code bucket; no bypass.
  PERFORM pg_advisory_xact_lock(5151980003);
  SELECT * INTO contact FROM pedpsy.participant_contacts q WHERE q.study_id=target_study AND q.email_key=email;
  SELECT * INTO c FROM pedpsy.participant_credentials q WHERE q.study_id=target_study AND q.participant_id=contact.participant_id;
  FOR bucket,window_ms,limit_n IN
    SELECT 'pedpsy-login:global',global_window_ms,global_limit UNION ALL
    SELECT 'pedpsy-email-login:'||target_study::text||':'||email,900000::bigint,5 UNION ALL
    SELECT 'pedpsy-login:'||c.login_id,900000::bigint,5 WHERE c.id IS NOT NULL LOOP
    bucket:='sha256:'||encode(sha256(convert_to(bucket,'UTF8')),'hex');
    SELECT * INTO throttle FROM pedpsy.login_throttles q WHERE q.bucket_hash=bucket FOR UPDATE;
    IF FOUND AND at_ms-throttle.window_start_ms<window_ms AND throttle.count>=limit_n THEN
      PERFORM pedpsy.registration_audit('participants.email_login.throttled',target_study,NULL,false);
      RETURN QUERY SELECT true,NULL::uuid,NULL::integer,NULL::text,NULL::text,NULL::uuid;RETURN;
    END IF;
    INSERT INTO pedpsy.login_throttles(bucket_hash,window_start_ms,count) VALUES(bucket,at_ms,1)
      ON CONFLICT(bucket_hash) DO UPDATE SET window_start_ms=CASE WHEN at_ms-login_throttles.window_start_ms>=window_ms THEN at_ms ELSE login_throttles.window_start_ms END,
      count=CASE WHEN at_ms-login_throttles.window_start_ms>=window_ms THEN 1 ELSE login_throttles.count+1 END;
  END LOOP;
  RETURN QUERY SELECT false,c.id,c.version,c.salt,c.password_hash,contact.id FROM pedpsy.studies s
    JOIN pedpsy.participants p ON p.study_id=s.id AND p.id=contact.participant_id
    JOIN pedpsy.participant_group_bindings b ON (b.study_id,b.participant_id)=(p.study_id,p.id)
    JOIN pedpsy.research_groups g ON (g.study_id,g.id)=(b.study_id,b.group_id)
    JOIN pedpsy.study_contact_policies policy ON policy.study_id=s.id JOIN pedpsy.contact_notices n ON n.version=policy.notice_version
    WHERE s.id=target_study AND s.status='active' AND s.dataset_kind='demo' AND p.status='active' AND g.status='active'
      AND c.id IS NOT NULL AND c.status='active' AND contact.status='active' AND n.legal_status='synthetic_only'
      AND EXISTS(SELECT 1 FROM pedpsy.participant_contact_acceptances a WHERE a.study_id=s.id AND a.contact_id=contact.id AND a.notice_version=n.version);
END $$;

CREATE FUNCTION reserve_registration_start_v2(digest text,browser text,email text,notice text,allow_real_email boolean,global_limit integer,global_window_ms bigint) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE x record;at_ms bigint;bucket text;window_ms bigint;limit_n integer;throttle record;target uuid;
BEGIN
  IF global_limit IS NULL OR global_limit<1 OR global_limit>1200 OR global_window_ms IS NULL OR global_window_ms<300000 OR global_window_ms>3600000
    THEN RAISE EXCEPTION 'INVALID_LOGIN_POLICY' USING ERRCODE='22023';END IF;
  PERFORM pg_advisory_xact_lock(5151980006);SELECT * INTO x FROM pedpsy.lock_registration_invite(digest);
  IF browser IS NULL OR browser !~ '^sha256:[a-f0-9]{64}$' OR browser=digest OR email IS NULL OR allow_real_email IS NULL OR length(email) NOT BETWEEN 3 AND 254
    OR (allow_real_email AND email !~ '^[A-Za-z0-9!#$%&''*+/=?^_`{|}~-]+([.][A-Za-z0-9!#$%&''*+/=?^_`{|}~-]+)*@[^@[:space:]]+$')
    OR (NOT allow_real_email AND email !~ '^[A-Za-z0-9!#$%&''*+/=?^_`{|}~-]+([.][A-Za-z0-9!#$%&''*+/=?^_`{|}~-]+)*@example[.]test$')
    THEN RAISE EXCEPTION 'INVALID_REGISTRATION_INPUT' USING ERRCODE='22023';END IF;
  IF notice IS DISTINCT FROM x.notice_version THEN RAISE EXCEPTION 'PARTICIPATION_REQUIREMENTS_CHANGED' USING ERRCODE='P0001';END IF;
  at_ms:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
  FOR bucket,window_ms,limit_n IN SELECT 'global',global_window_ms,global_limit UNION ALL SELECT 'browser:'||browser,900000::bigint,5 UNION ALL SELECT 'email:'||x.study_id::text||':'||email,900000::bigint,5 LOOP
    bucket:='sha256:'||encode(sha256(convert_to('pedpsy-registration-start:'||bucket,'UTF8')),'hex');
    SELECT * INTO throttle FROM pedpsy.login_throttles q WHERE q.bucket_hash=bucket FOR UPDATE;
    IF FOUND AND at_ms-throttle.window_start_ms<window_ms AND throttle.count>=limit_n THEN
      PERFORM pedpsy.registration_audit('participants.registration.throttled',x.study_id,NULL,false);RETURN NULL;
    END IF;
    INSERT INTO pedpsy.login_throttles(bucket_hash,window_start_ms,count) VALUES(bucket,at_ms,1)
      ON CONFLICT(bucket_hash) DO UPDATE SET window_start_ms=CASE WHEN at_ms-login_throttles.window_start_ms>=window_ms THEN at_ms ELSE login_throttles.window_start_ms END,
      count=CASE WHEN at_ms-login_throttles.window_start_ms>=window_ms THEN 1 ELSE login_throttles.count+1 END;
  END LOOP;
  IF (SELECT count(*) FROM pedpsy.registration_pending q WHERE q.study_id=x.study_id AND q.status IN ('reserved','pending') AND q.expires_at_ms>at_ms AND NOT(q.email_key=email AND q.browser_hash=browser))>=1000
    THEN RAISE EXCEPTION 'REGISTRATION_LIMIT' USING ERRCODE='54000';END IF;
  UPDATE pedpsy.contact_confirmation_outbox o SET status='cancelled' WHERE o.status='ready' AND o.pending_id IN
    (SELECT q.id FROM pedpsy.registration_pending q WHERE q.study_id=x.study_id AND q.email_key=email AND q.browser_hash=browser AND q.status IN ('reserved','pending'));
  UPDATE pedpsy.registration_pending q SET status='cancelled' WHERE q.study_id=x.study_id AND q.email_key=email AND q.browser_hash=browser AND q.status IN ('reserved','pending');
  target:=gen_random_uuid();
  INSERT INTO pedpsy.registration_pending(id,study_id,group_id,invitation_id,invitation_revision,browser_hash,email_key,contact_notice_version,created_at_ms,expires_at_ms)
    VALUES(target,x.study_id,x.group_id,x.invitation_id,x.invitation_revision,browser,email,notice,at_ms,at_ms+60000);
  PERFORM pedpsy.registration_audit('participants.registration.reserve',x.study_id,target);RETURN target;
END $$;

REVOKE ALL ON FUNCTION participant_login_material_v2(text,integer,bigint),participant_email_login_material_v2(uuid,text,boolean,integer,bigint),reserve_registration_start_v2(text,text,text,text,boolean,integer,bigint) FROM PUBLIC;
