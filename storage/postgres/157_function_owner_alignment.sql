SET LOCAL search_path=pedpsy,pg_catalog;
-- 157: every function in this schema must belong to the schema owner.
--
-- Applying a migration by hand as another role (for example, the bootstrap
-- superuser) creates its new functions under that role. A SECURITY DEFINER
-- function owned by the schema owner then cannot execute them, and the request
-- fails with "permission denied for function" — which is exactly how the
-- participant session started returning 500 while the profile endpoint still
-- worked: only the session path evaluates the row-level policies that reach the
-- new function.
--
-- Repair the owner of anything foreign, then fail loudly if anything is left, so
-- the next manual deployment cannot silently reproduce this.

DO $$
DECLARE schema_owner text; target record;
BEGIN
  SELECT pg_get_userbyid(nspowner) INTO schema_owner FROM pg_namespace WHERE nspname='pedpsy';
  IF schema_owner IS NULL THEN RAISE EXCEPTION 'SCHEMA_MISSING';END IF;
  FOR target IN
    SELECT p.oid
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='pedpsy' AND pg_get_userbyid(p.proowner) IS DISTINCT FROM schema_owner
  LOOP
    EXECUTE format('ALTER FUNCTION %s OWNER TO %I', target.oid::regprocedure, schema_owner);
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
              WHERE n.nspname='pedpsy' AND pg_get_userbyid(p.proowner) IS DISTINCT FROM schema_owner) THEN
    RAISE EXCEPTION 'SCHEMA_FUNCTION_OWNER_MISMATCH';
  END IF;
END $$;
