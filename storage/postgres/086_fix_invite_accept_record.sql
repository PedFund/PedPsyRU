SET LOCAL search_path=pedpsy,pg_catalog;
-- 086: an invite acceptance with an unknown token left the record variable `c`
-- unassigned. PostgreSQL may evaluate the branches of OR in any order, so the
-- `NOT EXISTS(... c.user_id ...)` branch could run before the null checks and
-- fail with `record "c" is not assigned yet` instead of denying the invite.
-- Resolve each record in its own step and never read a field before its SELECT.
CREATE OR REPLACE FUNCTION accept_researcher_invite(invite_hash text,new_salt text,new_hash text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE i record;c record;at bigint;user_active boolean;
BEGIN
  at:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
  SELECT * INTO i FROM pedpsy.researcher_invites WHERE token_hash=invite_hash;
  IF NOT FOUND THEN
    INSERT INTO pedpsy.access_audit_events(id,at_ms,action,outcome,reason) VALUES(gen_random_uuid(),at,'invite_accept','deny','INVALID_INVITE');RETURN NULL;
  END IF;
  SELECT * INTO c FROM pedpsy.researcher_credentials WHERE id=i.credential_id FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO pedpsy.access_audit_events(id,at_ms,action,outcome,reason) VALUES(gen_random_uuid(),at,'invite_accept','deny','INVALID_INVITE');RETURN NULL;
  END IF;
  PERFORM 1 FROM pedpsy.users WHERE id=c.user_id FOR SHARE;
  SELECT status='active' INTO user_active FROM pedpsy.users WHERE id=c.user_id;
  SELECT * INTO i FROM pedpsy.researcher_invites WHERE token_hash=invite_hash FOR UPDATE;
  IF NOT FOUND OR i.used_at_ms IS NOT NULL OR i.revoked_at_ms IS NOT NULL OR at>=i.expires_at_ms
    OR NOT coalesce(user_active,false) THEN
    INSERT INTO pedpsy.access_audit_events(id,at_ms,action,outcome,reason) VALUES(gen_random_uuid(),at,'invite_accept','deny','INVALID_INVITE');RETURN NULL;
  END IF;
  UPDATE pedpsy.researcher_credentials SET salt=new_salt,password_hash=new_hash,status='active',version=version+1,updated_at=clock_timestamp() WHERE id=c.id;
  UPDATE pedpsy.researcher_invites SET used_at_ms=at WHERE token_hash=invite_hash;
  INSERT INTO pedpsy.access_audit_events(id,at_ms,credential_id,action,outcome,reason) VALUES(gen_random_uuid(),at,c.id,'invite_accept','allow','SYNTHETIC_RESEARCHER');RETURN c.login_id;
END $$;
REVOKE ALL ON FUNCTION accept_researcher_invite(text,text,text) FROM PUBLIC;
