SET LOCAL search_path=pedpsy,pg_catalog;
CREATE TABLE researcher_invites (
  token_hash text PRIMARY KEY CHECK(token_hash ~ '^sha256:[a-f0-9]{64}$'), credential_id uuid NOT NULL REFERENCES researcher_credentials(id),
  created_by uuid NOT NULL REFERENCES staff_credentials(id),created_at_ms bigint NOT NULL,expires_at_ms bigint NOT NULL,
  used_at_ms bigint,revoked_at_ms bigint,CHECK(expires_at_ms>created_at_ms AND expires_at_ms-created_at_ms<=86400000)
);
CREATE INDEX researcher_invites_credential ON researcher_invites(credential_id);
CREATE INDEX researcher_invites_sender ON researcher_invites(created_by,created_at_ms);
CREATE FUNCTION invalidate_researcher_sessions() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,pedpsy AS $$
BEGIN
  IF NEW.version>OLD.version THEN UPDATE pedpsy.researcher_sessions SET revoked_at_ms=floor(extract(epoch FROM clock_timestamp())*1000)::bigint WHERE credential_id=OLD.id AND revoked_at_ms IS NULL; END IF;RETURN NEW;
END $$;
CREATE TRIGGER researcher_version_guard BEFORE UPDATE ON researcher_credentials FOR EACH ROW EXECUTE FUNCTION invalidate_researcher_sessions();
CREATE FUNCTION lock_staff_operation(operation text) RETURNS TABLE(credential_id uuid,user_id uuid,actor_role text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE a record;
BEGIN
  PERFORM pg_advisory_xact_lock(5151980005);PERFORM pedpsy.lock_staff_identity();SELECT * INTO a FROM pedpsy.account_actor();
  IF operation NOT IN ('researchers.read','researchers.invite','researchers.block','staff.roles.assign','protocols.read','protocols.download','results.read','results.download')
    OR (operation='staff.roles.assign' AND a.actor_role<>'superadministrator') THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';END IF;
  IF operation IN ('researchers.invite','researchers.block','staff.roles.assign','protocols.download','results.download')
    AND floor(extract(epoch FROM clock_timestamp())*1000)::bigint-a.mfa_verified_at_ms>=300000 THEN RAISE EXCEPTION 'MFA_RECHECK_REQUIRED' USING ERRCODE='42501';END IF;
  RETURN QUERY SELECT a.credential_id,a.user_id,a.actor_role;
END $$;
CREATE FUNCTION list_researchers() RETURNS TABLE(id uuid,user_id uuid,login_id text,status text,active_study_quota integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
BEGIN
  PERFORM pedpsy.lock_staff_operation('researchers.read');
  IF (SELECT count(*) FROM pedpsy.researcher_credentials)>500 THEN RAISE EXCEPTION 'EXPORT_LIMIT' USING ERRCODE='54000';END IF;
  PERFORM pedpsy.record_account_check('researchers.read',true,'GLOBAL_SCOPE');PERFORM pedpsy.touch_staff_identity();
  RETURN QUERY SELECT c.id,c.user_id,c.login_id,c.status,c.active_study_quota FROM pedpsy.researcher_credentials c ORDER BY c.created_at,c.id;
END $$;
CREATE FUNCTION invite_researcher(credential uuid,actor_user uuid,login text,invite_hash text,initial_salt text,initial_hash text) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE a record;at bigint;
BEGIN
  SELECT * INTO a FROM pedpsy.lock_staff_operation('researchers.invite');at:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
  IF (SELECT count(*) FROM pedpsy.researcher_invites WHERE created_by=a.credential_id AND created_at_ms>at-3600000)>=5
    OR (SELECT count(*) FROM pedpsy.researcher_invites WHERE created_at_ms>at-3600000)>=30 THEN RAISE EXCEPTION 'INVITE_THROTTLED' USING ERRCODE='54000';END IF;
  INSERT INTO pedpsy.users(id) VALUES(actor_user);
  INSERT INTO pedpsy.researcher_credentials(id,user_id,login_id,scheme,salt,password_hash,status)
    VALUES(credential,actor_user,login,'scrypt-N131072-r8-p1-dk64',initial_salt,initial_hash,'revoked');
  INSERT INTO pedpsy.researcher_invites(token_hash,credential_id,created_by,created_at_ms,expires_at_ms) VALUES(invite_hash,credential,a.credential_id,at,at+86400000);
  PERFORM pedpsy.record_account_check('researchers.invite',true,'SYNTHETIC_PREVIEW');PERFORM pedpsy.touch_staff_identity();RETURN at+86400000;
END $$;
CREATE FUNCTION accept_researcher_invite(invite_hash text,new_salt text,new_hash text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE i record;c record;at bigint;
BEGIN
  SELECT * INTO i FROM pedpsy.researcher_invites WHERE token_hash=invite_hash;
  IF FOUND THEN
    SELECT * INTO c FROM pedpsy.researcher_credentials WHERE id=i.credential_id FOR UPDATE;
    PERFORM 1 FROM pedpsy.users WHERE id=c.user_id FOR SHARE;
    SELECT * INTO i FROM pedpsy.researcher_invites WHERE token_hash=invite_hash FOR UPDATE;
  END IF;
  at:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
  IF i.credential_id IS NULL OR i.used_at_ms IS NOT NULL OR i.revoked_at_ms IS NOT NULL OR at>=i.expires_at_ms
    OR NOT EXISTS(SELECT 1 FROM pedpsy.users WHERE id=c.user_id AND status='active') THEN
    INSERT INTO pedpsy.access_audit_events(id,at_ms,action,outcome,reason) VALUES(gen_random_uuid(),at,'invite_accept','deny','INVALID_INVITE');RETURN false;
  END IF;
  UPDATE pedpsy.researcher_credentials SET salt=new_salt,password_hash=new_hash,status='active',version=version+1,updated_at=clock_timestamp() WHERE id=c.id;
  UPDATE pedpsy.researcher_invites SET used_at_ms=at WHERE token_hash=invite_hash;
  INSERT INTO pedpsy.access_audit_events(id,at_ms,credential_id,action,outcome,reason) VALUES(gen_random_uuid(),at,c.id,'invite_accept','allow','SYNTHETIC_RESEARCHER');RETURN true;
END $$;
CREATE FUNCTION reserve_invite_attempt(invite_hash text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE at bigint:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;bucket text;limit_n integer;state record;
BEGIN
  IF invite_hash IS NULL OR invite_hash !~ '^sha256:[a-f0-9]{64}$' THEN RETURN false;END IF;
  PERFORM pg_advisory_xact_lock(5151980007);
  FOR bucket,limit_n IN SELECT 'global',30 UNION ALL SELECT invite_hash,5 LOOP
    bucket:='sha256:'||encode(sha256(convert_to('pedpsy-invite-accept:'||bucket,'UTF8')),'hex');
    SELECT * INTO state FROM pedpsy.login_throttles WHERE bucket_hash=bucket FOR UPDATE;
    IF FOUND AND at-state.window_start_ms<900000 AND state.count>=limit_n THEN
      INSERT INTO pedpsy.access_audit_events(id,at_ms,action,outcome,reason) VALUES(gen_random_uuid(),at,'invite_accept','deny','LOGIN_THROTTLED');RETURN false;
    END IF;
    INSERT INTO pedpsy.login_throttles(bucket_hash,window_start_ms,count) VALUES(bucket,at,1) ON CONFLICT(bucket_hash)
      DO UPDATE SET window_start_ms=CASE WHEN at-login_throttles.window_start_ms>=900000 THEN at ELSE login_throttles.window_start_ms END,
        count=CASE WHEN at-login_throttles.window_start_ms>=900000 THEN 1 ELSE login_throttles.count+1 END;
  END LOOP;RETURN true;
END $$;
CREATE FUNCTION block_researcher(credential uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE c record;
BEGIN
  PERFORM pedpsy.lock_staff_operation('researchers.block');
  SELECT * INTO c FROM pedpsy.researcher_credentials WHERE id=credential FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_AVAILABLE' USING ERRCODE='P0002';END IF;
  PERFORM 1 FROM pedpsy.users WHERE id=c.user_id FOR UPDATE;
  UPDATE pedpsy.researcher_credentials SET status='revoked',version=version+1,updated_at=clock_timestamp() WHERE id=c.id;
  UPDATE pedpsy.users SET status='disabled',updated_at=clock_timestamp() WHERE id=c.user_id;
  UPDATE pedpsy.researcher_invites SET revoked_at_ms=floor(extract(epoch FROM clock_timestamp())*1000)::bigint WHERE credential_id=c.id AND used_at_ms IS NULL AND revoked_at_ms IS NULL;
  PERFORM pedpsy.record_account_check('researchers.block',true,'RESEARCHER_BLOCKED');PERFORM pedpsy.touch_staff_identity();
END $$;
CREATE FUNCTION researcher_login_material(code text) RETURNS TABLE(throttled boolean,credential_id uuid,credential_version integer,salt text,password_hash text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE at bigint:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;bucket text;window_ms bigint;limit_n integer;state record;
BEGIN
  IF code IS NULL OR code !~ '^[A-Z0-9-]{3,80}$' THEN RAISE EXCEPTION 'INVALID_LOGIN' USING ERRCODE='28000';END IF;
  PERFORM pg_advisory_xact_lock(5151980006);
  FOR bucket,window_ms,limit_n IN SELECT 'global',300000::bigint,30 UNION ALL SELECT code,900000::bigint,5 LOOP
    bucket:='sha256:'||encode(sha256(convert_to('pedpsy-researcher-login:'||bucket,'UTF8')),'hex');
    SELECT * INTO state FROM pedpsy.login_throttles WHERE bucket_hash=bucket FOR UPDATE;
    IF FOUND AND at-state.window_start_ms<window_ms AND state.count>=limit_n THEN
      INSERT INTO pedpsy.access_audit_events(id,at_ms,action,outcome,reason) VALUES(gen_random_uuid(),at,'researcher_login','deny','LOGIN_THROTTLED');
      RETURN QUERY SELECT true,NULL::uuid,NULL::integer,NULL::text,NULL::text;RETURN;
    END IF;
    INSERT INTO pedpsy.login_throttles(bucket_hash,window_start_ms,count) VALUES(bucket,at,1)
      ON CONFLICT(bucket_hash) DO UPDATE SET window_start_ms=CASE WHEN at-login_throttles.window_start_ms>=window_ms THEN at ELSE login_throttles.window_start_ms END,
      count=CASE WHEN at-login_throttles.window_start_ms>=window_ms THEN 1 ELSE login_throttles.count+1 END;
  END LOOP;
  RETURN QUERY SELECT false,c.id,c.version,c.salt,c.password_hash FROM pedpsy.researcher_credentials c JOIN pedpsy.users u ON u.id=c.user_id
    WHERE c.login_id=code AND c.status='active' AND u.status='active';
END $$;
CREATE FUNCTION finish_researcher_login(credential uuid,expected_version integer,derived_hash text,session_hash text) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE c record;at bigint;
BEGIN
  SELECT * INTO c FROM pedpsy.researcher_credentials WHERE id=credential FOR UPDATE;
  IF FOUND THEN PERFORM 1 FROM pedpsy.users WHERE id=c.user_id FOR SHARE;END IF;
  at:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
  IF c.id IS NULL OR c.status<>'active' OR c.version IS DISTINCT FROM expected_version OR c.password_hash IS DISTINCT FROM derived_hash
    OR NOT EXISTS(SELECT 1 FROM pedpsy.users WHERE id=c.user_id AND status='active') THEN
    INSERT INTO pedpsy.access_audit_events(id,at_ms,action,outcome,reason) VALUES(gen_random_uuid(),at,'researcher_login','deny','INVALID_LOGIN');RETURN NULL;
  END IF;
  UPDATE pedpsy.researcher_sessions SET revoked_at_ms=at WHERE credential_id=c.id AND revoked_at_ms IS NULL;
  INSERT INTO pedpsy.researcher_sessions(token_hash,credential_id,user_id,credential_version,created_at_ms,last_seen_at_ms,expires_at_ms) VALUES(session_hash,c.id,c.user_id,c.version,at,at,at+1800000);
  INSERT INTO pedpsy.access_audit_events(id,at_ms,credential_id,action,outcome,reason) VALUES(gen_random_uuid(),at,c.id,'researcher_login','allow','RESEARCHER_SCOPE');RETURN at+1800000;
END $$;
CREATE FUNCTION lock_researcher_identity() RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE a record;
BEGIN
  SELECT * INTO a FROM pedpsy.account_actor();IF NOT FOUND OR a.actor_role<>'researcher' THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE='28000';END IF;
  PERFORM 1 FROM pedpsy.researcher_credentials WHERE id=a.credential_id FOR SHARE;
  PERFORM 1 FROM pedpsy.users WHERE id=a.user_id FOR SHARE;
  PERFORM 1 FROM pedpsy.researcher_sessions WHERE token_hash=current_setting('app.session_hash',true) FOR UPDATE;
  SELECT * INTO a FROM pedpsy.account_actor();IF NOT FOUND OR a.actor_role<>'researcher' THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE='28000';END IF;RETURN a.credential_id;
END $$;
CREATE FUNCTION researcher_home() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE credential uuid;data jsonb;
BEGIN
  credential:=pedpsy.lock_researcher_identity();
  SELECT jsonb_build_object('active_study_quota',c.active_study_quota,'studies',coalesce((SELECT jsonb_agg(jsonb_build_object('id',s.id,'title',s.title,'status',s.status) ORDER BY s.id)
    FROM pedpsy.study_memberships m JOIN pedpsy.studies s ON s.id=m.study_id WHERE m.user_id=c.user_id AND m.role='researcher' AND m.status='active' AND s.dataset_kind='demo'),'[]'::jsonb)) INTO data
    FROM pedpsy.researcher_credentials c WHERE c.id=credential;
  PERFORM pedpsy.record_account_check('account.read',true,'RESEARCHER_SCOPE');
  UPDATE pedpsy.researcher_sessions SET last_seen_at_ms=floor(extract(epoch FROM clock_timestamp())*1000)::bigint WHERE token_hash=current_setting('app.session_hash',true);RETURN data;
END $$;
CREATE FUNCTION logout_researcher() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
BEGIN
  PERFORM pedpsy.lock_researcher_identity();PERFORM pedpsy.record_account_check('researcher.logout',true,'CURRENT_IDENTITY');
  UPDATE pedpsy.researcher_sessions SET revoked_at_ms=floor(extract(epoch FROM clock_timestamp())*1000)::bigint WHERE token_hash=current_setting('app.session_hash',true);
END $$;
REVOKE ALL ON researcher_invites FROM PUBLIC;
REVOKE ALL ON FUNCTION invalidate_researcher_sessions(),lock_staff_operation(text),list_researchers(),invite_researcher(uuid,uuid,text,text,text,text),accept_researcher_invite(text,text,text),reserve_invite_attempt(text),block_researcher(uuid),researcher_login_material(text),finish_researcher_login(uuid,integer,text,text),lock_researcher_identity(),researcher_home(),logout_researcher() FROM PUBLIC;
