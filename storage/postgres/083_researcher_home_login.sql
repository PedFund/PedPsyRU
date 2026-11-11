SET LOCAL search_path=pedpsy,pg_catalog;
-- 083: return the researcher's login id with the own home snapshot so the
-- cabinet can show and copy it after invitation acceptance.
CREATE OR REPLACE FUNCTION researcher_home() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE credential uuid;data jsonb;
BEGIN
  credential:=pedpsy.lock_researcher_identity();
  SELECT jsonb_build_object('login_id',c.login_id,'active_study_quota',c.active_study_quota,'studies',coalesce((SELECT jsonb_agg(jsonb_build_object('id',s.id,'title',s.title,'status',s.status) ORDER BY s.id)
    FROM pedpsy.study_memberships m JOIN pedpsy.studies s ON s.id=m.study_id WHERE m.user_id=c.user_id AND m.role='researcher' AND m.status='active' AND s.dataset_kind='demo'),'[]'::jsonb)) INTO data
    FROM pedpsy.researcher_credentials c WHERE c.id=credential;
  PERFORM pedpsy.record_account_check('account.read',true,'RESEARCHER_SCOPE');
  UPDATE pedpsy.researcher_sessions SET last_seen_at_ms=floor(extract(epoch FROM clock_timestamp())*1000)::bigint WHERE token_hash=current_setting('app.session_hash',true);RETURN data;
END $$;
REVOKE ALL ON FUNCTION researcher_home() FROM PUBLIC;
