SET LOCAL search_path=pedpsy,pg_catalog;
-- 154: a researcher should be recognisable by name, not only by the generated
-- login id. The login id stays the credential and the audit key; the name is a
-- separate, optional attribute of the account.
--
-- Additive only: one nullable column, one check, the same listing and home
-- functions with one extra field, and a self-service rename that can only touch
-- the caller's own row.

ALTER TABLE pedpsy.users ADD COLUMN IF NOT EXISTS display_name text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='users_display_name_check' AND conrelid='pedpsy.users'::regclass) THEN
    ALTER TABLE pedpsy.users ADD CONSTRAINT users_display_name_check
      CHECK (display_name IS NULL OR (display_name=btrim(display_name) AND char_length(display_name) BETWEEN 1 AND 80 AND display_name !~ '[[:cntrl:]]'));
  END IF;
END $$;

-- The staff directory needs the name next to the login id. The return type grows,
-- so the function is recreated; the next runtime grant pass restores EXECUTE.
DROP FUNCTION IF EXISTS pedpsy.list_researchers();
CREATE FUNCTION pedpsy.list_researchers() RETURNS TABLE(id uuid,user_id uuid,login_id text,status text,active_study_quota integer,display_name text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
BEGIN
  PERFORM pedpsy.lock_staff_operation('researchers.read');
  IF (SELECT count(*) FROM pedpsy.researcher_credentials)>500 THEN RAISE EXCEPTION 'EXPORT_LIMIT' USING ERRCODE='54000';END IF;
  PERFORM pedpsy.record_account_check('researchers.read',true,'GLOBAL_SCOPE');PERFORM pedpsy.touch_staff_identity();
  RETURN QUERY SELECT c.id,c.user_id,c.login_id,c.status,c.active_study_quota,u.display_name
    FROM pedpsy.researcher_credentials c LEFT JOIN pedpsy.users u ON u.id=c.user_id
    ORDER BY c.created_at,c.id;
END $$;
REVOKE ALL ON FUNCTION pedpsy.list_researchers() FROM PUBLIC;

-- The cabinet shows the name the researcher chose for themselves.
CREATE OR REPLACE FUNCTION pedpsy.researcher_home() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE credential uuid;data jsonb;
BEGIN
  credential:=pedpsy.lock_researcher_identity();
  SELECT jsonb_build_object('login_id',c.login_id,'display_name',(SELECT u.display_name FROM pedpsy.users u WHERE u.id=c.user_id),'active_study_quota',c.active_study_quota,'studies',coalesce((SELECT jsonb_agg(jsonb_build_object('id',s.id,'title',s.title,'status',s.status) ORDER BY s.id)
    FROM pedpsy.study_memberships m JOIN pedpsy.studies s ON s.id=m.study_id WHERE m.user_id=c.user_id AND m.role='researcher' AND m.status='active' AND s.dataset_kind='demo'),'[]'::jsonb)) INTO data
    FROM pedpsy.researcher_credentials c WHERE c.id=credential;
  PERFORM pedpsy.record_account_check('account.read',true,'RESEARCHER_SCOPE');
  UPDATE pedpsy.researcher_sessions SET last_seen_at_ms=floor(extract(epoch FROM clock_timestamp())*1000)::bigint WHERE token_hash=current_setting('app.session_hash',true);RETURN data;
END $$;
REVOKE ALL ON FUNCTION pedpsy.researcher_home() FROM PUBLIC;

-- Self-service rename: the credential comes from the session, never from input.
CREATE OR REPLACE FUNCTION pedpsy.rename_own_researcher(target_name text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE credential uuid; cleaned text; owner_user uuid;
BEGIN
  credential:=pedpsy.lock_researcher_identity();
  cleaned:=btrim(coalesce(target_name,''));
  IF char_length(cleaned) NOT BETWEEN 1 AND 80 OR cleaned ~ '[[:cntrl:]]' THEN
    RAISE EXCEPTION 'INVALID_DISPLAY_NAME' USING ERRCODE='22023';
  END IF;
  SELECT c.user_id INTO owner_user FROM pedpsy.researcher_credentials c WHERE c.id=credential;
  IF owner_user IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE='28000';END IF;
  UPDATE pedpsy.users SET display_name=cleaned,updated_at=clock_timestamp() WHERE id=owner_user;
  PERFORM pedpsy.record_account_check('researcher.renamed',true,'RESEARCHER_SCOPE');
  RETURN cleaned;
END $$;
REVOKE ALL ON FUNCTION pedpsy.rename_own_researcher(text) FROM PUBLIC;
