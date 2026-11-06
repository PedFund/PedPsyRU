SET LOCAL search_path=pedpsy,pg_catalog;
-- 074: the invitation acceptance returns the researcher login id so the
-- one-time invite link can log the researcher in without a second manual step.
-- The function signature is unchanged; only the return value changes.
DROP FUNCTION IF EXISTS pedpsy.accept_researcher_invite(text,text,text);
CREATE FUNCTION accept_researcher_invite(invite_hash text,new_salt text,new_hash text) RETURNS text
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
    INSERT INTO pedpsy.access_audit_events(id,at_ms,action,outcome,reason) VALUES(gen_random_uuid(),at,'invite_accept','deny','INVALID_INVITE');RETURN NULL;
  END IF;
  UPDATE pedpsy.researcher_credentials SET salt=new_salt,password_hash=new_hash,status='active',version=version+1,updated_at=clock_timestamp() WHERE id=c.id;
  UPDATE pedpsy.researcher_invites SET used_at_ms=at WHERE token_hash=invite_hash;
  INSERT INTO pedpsy.access_audit_events(id,at_ms,credential_id,action,outcome,reason) VALUES(gen_random_uuid(),at,c.id,'invite_accept','allow','SYNTHETIC_RESEARCHER');RETURN c.login_id;
END $$;
REVOKE ALL ON FUNCTION accept_researcher_invite(text,text,text) FROM PUBLIC;
