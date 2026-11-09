SET LOCAL search_path=pedpsy,pg_catalog;
-- 075: allow the offline owner bootstrap on staging/production databases and add
-- a second, owner-only staff provisioning step. Runtime never gets EXECUTE.
CREATE OR REPLACE FUNCTION bootstrap_first_superadmin(credential uuid,actor_user uuid,login text,password_salt text,derived_hash text) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
BEGIN
  IF current_database() !~ '^pedpsy_(demo|ci|staging|prod)_[a-f0-9]{16}$' OR NOT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='pedpsy' AND nspowner=(SELECT oid FROM pg_roles WHERE rolname=current_user))
    THEN RAISE EXCEPTION 'OFFLINE_SYNTHETIC_OWNER_REQUIRED' USING ERRCODE='42501';END IF;
  PERFORM pg_advisory_xact_lock(5151980005);
  IF EXISTS(SELECT 1 FROM pedpsy.staff_credentials) THEN RAISE EXCEPTION 'FIRST_STAFF_ALREADY_EXISTS' USING ERRCODE='23514';END IF;
  INSERT INTO pedpsy.users(id) VALUES(actor_user);
  INSERT INTO pedpsy.staff_credentials(id,user_id,login_id,role,scheme,salt,password_hash) VALUES(credential,actor_user,login,'superadministrator','scrypt-N131072-r8-p1-dk64',password_salt,derived_hash);
  INSERT INTO pedpsy.access_audit_events(id,at_ms,credential_id,action,outcome,reason,actor_role)
    VALUES(gen_random_uuid(),floor(extract(epoch FROM clock_timestamp())*1000)::bigint,credential,'staff_bootstrap','allow','OFFLINE_OWNER_BOOTSTRAP','superadministrator');
END $$;
CREATE FUNCTION bootstrap_staff(credential uuid,actor_user uuid,login text,password_salt text,derived_hash text,new_role text) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
BEGIN
  IF current_database() !~ '^pedpsy_(demo|ci|staging|prod)_[a-f0-9]{16}$' OR NOT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='pedpsy' AND nspowner=(SELECT oid FROM pg_roles WHERE rolname=current_user))
    THEN RAISE EXCEPTION 'OFFLINE_OWNER_REQUIRED' USING ERRCODE='42501';END IF;
  IF new_role IS NULL OR new_role NOT IN ('administrator','superadministrator') THEN RAISE EXCEPTION 'INVALID_ROLE' USING ERRCODE='22023';END IF;
  IF login IS NULL OR login !~ '^[A-Z0-9-]{3,80}$' THEN RAISE EXCEPTION 'INVALID_LOGIN' USING ERRCODE='22023';END IF;
  PERFORM pg_advisory_xact_lock(5151980005);
  IF NOT EXISTS(SELECT 1 FROM pedpsy.staff_credentials) THEN RAISE EXCEPTION 'FIRST_STAFF_REQUIRED' USING ERRCODE='42501';END IF;
  IF NOT EXISTS(SELECT 1 FROM pedpsy.staff_credentials c JOIN pedpsy.users u ON u.id=c.user_id WHERE c.role='superadministrator' AND c.status='active' AND u.status='active')
    THEN RAISE EXCEPTION 'SUPERADMIN_REQUIRED' USING ERRCODE='42501';END IF;
  IF EXISTS(SELECT 1 FROM pedpsy.staff_credentials WHERE login_id=login) THEN RAISE EXCEPTION 'LOGIN_EXISTS' USING ERRCODE='23505';END IF;
  INSERT INTO pedpsy.users(id) VALUES(actor_user);
  INSERT INTO pedpsy.staff_credentials(id,user_id,login_id,role,scheme,salt,password_hash) VALUES(credential,actor_user,login,new_role,'scrypt-N131072-r8-p1-dk64',password_salt,derived_hash);
  INSERT INTO pedpsy.access_audit_events(id,at_ms,credential_id,action,outcome,reason,actor_role,resource_id)
    VALUES(gen_random_uuid(),floor(extract(epoch FROM clock_timestamp())*1000)::bigint,credential,'staff_bootstrap','allow','OFFLINE_STAFF_BOOTSTRAP','superadministrator',actor_user);
END $$;
REVOKE ALL ON FUNCTION bootstrap_first_superadmin(uuid,uuid,text,text,text),bootstrap_staff(uuid,uuid,text,text,text,text) FROM PUBLIC;
