SET LOCAL search_path=pedpsy,pg_catalog;
-- Preserve revoked session history during legitimate role changes.
ALTER TABLE staff_sessions DROP CONSTRAINT staff_sessions_credential_id_user_id_role_fkey;
ALTER TABLE staff_sessions ADD CONSTRAINT staff_session_identity_fk FOREIGN KEY(credential_id,user_id,role) REFERENCES staff_credentials(id,user_id,role) ON UPDATE CASCADE;
CREATE FUNCTION guard_staff_identity() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,pedpsy AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'revoke credentials instead' USING ERRCODE='23514';END IF;
  IF (NEW.id,NEW.user_id,NEW.login_id,NEW.scheme) IS DISTINCT FROM (OLD.id,OLD.user_id,OLD.login_id,OLD.scheme)
    THEN RAISE EXCEPTION 'staff identity is frozen' USING ERRCODE='23514';END IF;RETURN NEW;
END $$;
DROP TRIGGER staff_credential_guard ON staff_credentials;
CREATE TRIGGER staff_credential_guard BEFORE UPDATE OR DELETE ON staff_credentials FOR EACH ROW EXECUTE FUNCTION guard_staff_identity();
CREATE FUNCTION assign_staff_role(target_user uuid,new_role text,new_credential uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE a record;c record;r record;
BEGIN
  SELECT * INTO a FROM pedpsy.lock_staff_operation('staff.roles.assign');
  IF new_role NOT IN ('administrator','superadministrator') OR new_role IS NULL THEN RAISE EXCEPTION 'INVALID_ROLE' USING ERRCODE='22023';END IF;
  -- No self privilege mutation, even by an already privileged caller.
  IF target_user=a.user_id THEN RAISE EXCEPTION 'SELF_ROLE_CHANGE_FORBIDDEN' USING ERRCODE='42501';END IF;
  SELECT * INTO c FROM pedpsy.staff_credentials WHERE user_id=target_user FOR UPDATE;
  IF FOUND THEN
    IF c.role='superadministrator' AND new_role='administrator' AND c.status='active' AND
      (SELECT count(*) FROM pedpsy.staff_credentials x JOIN pedpsy.users u ON u.id=x.user_id WHERE x.role='superadministrator' AND x.status='active' AND u.status='active')<=1
      THEN RAISE EXCEPTION 'LAST_SUPERADMIN_REQUIRED' USING ERRCODE='42501';END IF;
    IF c.status<>'active' OR NOT EXISTS(SELECT 1 FROM pedpsy.users WHERE id=target_user AND status='active') THEN RAISE EXCEPTION 'NOT_AVAILABLE' USING ERRCODE='P0002';END IF;
    UPDATE pedpsy.staff_credentials SET role=new_role,version=version+1 WHERE id=c.id;
  ELSE
    SELECT * INTO r FROM pedpsy.researcher_credentials WHERE user_id=target_user FOR UPDATE;
    IF NOT FOUND OR r.status<>'active' THEN RAISE EXCEPTION 'NOT_AVAILABLE' USING ERRCODE='P0002';END IF;
    PERFORM 1 FROM pedpsy.users WHERE id=target_user AND status='active' FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'NOT_AVAILABLE' USING ERRCODE='P0002';END IF;
    INSERT INTO pedpsy.staff_credentials(id,user_id,login_id,role,scheme,salt,password_hash) VALUES(new_credential,target_user,r.login_id,new_role,r.scheme,r.salt,r.password_hash);
    -- Explicit promotion replaces researcher authority, not two simultaneous roles.
    UPDATE pedpsy.researcher_credentials SET status='revoked',version=version+1,updated_at=clock_timestamp() WHERE id=r.id;
  END IF;
  INSERT INTO pedpsy.access_audit_events(id,at_ms,credential_id,action,outcome,reason,actor_role,resource_id)
    VALUES(gen_random_uuid(),floor(extract(epoch FROM clock_timestamp())*1000)::bigint,a.credential_id,'staff.roles.assign','allow',
      CASE WHEN new_role='administrator' THEN 'ASSIGNED_ADMINISTRATOR' ELSE 'ASSIGNED_SUPERADMINISTRATOR' END,a.actor_role,target_user);
  PERFORM pedpsy.touch_staff_identity();
END $$;
CREATE FUNCTION list_staff_accounts() RETURNS TABLE(id uuid,user_id uuid,login_id text,role text,status text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
BEGIN
  PERFORM pedpsy.lock_staff_operation('staff.roles.assign');
  IF (SELECT count(*) FROM pedpsy.staff_credentials)>500 THEN RAISE EXCEPTION 'EXPORT_LIMIT' USING ERRCODE='54000';END IF;
  PERFORM pedpsy.record_account_check('staff.roles.assign',true,'STAFF_DIRECTORY');PERFORM pedpsy.touch_staff_identity();
  RETURN QUERY SELECT c.id,c.user_id,c.login_id,c.role,c.status FROM pedpsy.staff_credentials c ORDER BY c.created_at,c.id;
END $$;
-- Invoker-only, not granted to runtime and never called from HTTP/startup.
CREATE FUNCTION bootstrap_first_superadmin(credential uuid,actor_user uuid,login text,password_salt text,derived_hash text) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
BEGIN
  IF current_database() !~ '^pedpsy_(demo|ci)_[a-f0-9]{16}$' OR NOT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='pedpsy' AND nspowner=(SELECT oid FROM pg_roles WHERE rolname=current_user))
    THEN RAISE EXCEPTION 'OFFLINE_SYNTHETIC_OWNER_REQUIRED' USING ERRCODE='42501';END IF;
  PERFORM pg_advisory_xact_lock(5151980005);
  IF EXISTS(SELECT 1 FROM pedpsy.staff_credentials) THEN RAISE EXCEPTION 'FIRST_STAFF_ALREADY_EXISTS' USING ERRCODE='23514';END IF;
  INSERT INTO pedpsy.users(id) VALUES(actor_user);
  INSERT INTO pedpsy.staff_credentials(id,user_id,login_id,role,scheme,salt,password_hash) VALUES(credential,actor_user,login,'superadministrator','scrypt-N131072-r8-p1-dk64',password_salt,derived_hash);
  INSERT INTO pedpsy.access_audit_events(id,at_ms,credential_id,action,outcome,reason,actor_role)
    VALUES(gen_random_uuid(),floor(extract(epoch FROM clock_timestamp())*1000)::bigint,credential,'staff_bootstrap','allow','OFFLINE_SYNTHETIC_OWNER','superadministrator');
END $$;
REVOKE ALL ON FUNCTION guard_staff_identity(),assign_staff_role(uuid,text,uuid),list_staff_accounts(),bootstrap_first_superadmin(uuid,uuid,text,text,text) FROM PUBLIC;
