SET LOCAL search_path=pedpsy,pg_catalog;
-- Approved MVP delegation: real staff identity, never a researcher session.
CREATE OR REPLACE FUNCTION lock_staff_operation(operation text) RETURNS TABLE(credential_id uuid,user_id uuid,actor_role text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE a record;
BEGIN
  PERFORM pg_advisory_xact_lock(5151980005);PERFORM pedpsy.lock_staff_identity();SELECT * INTO a FROM pedpsy.account_actor();
  IF operation NOT IN ('studies.configure','researchers.read','researchers.invite','researchers.block','staff.roles.assign','protocols.read','protocols.download','results.read','results.download')
    OR (operation='staff.roles.assign' AND a.actor_role<>'superadministrator') THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';END IF;
  IF operation IN ('studies.configure','researchers.invite','researchers.block','staff.roles.assign','protocols.download','results.download')
    AND floor(extract(epoch FROM clock_timestamp())*1000)::bigint-a.mfa_verified_at_ms>=300000 THEN RAISE EXCEPTION 'MFA_RECHECK_REQUIRED' USING ERRCODE='42501';END IF;
  RETURN QUERY SELECT a.credential_id,a.user_id,a.actor_role;
END $$;

-- Staff management shares the real owner's quota lock with researcher writes.
-- Pre-read identifies the lock only; membership is rechecked AFTER study lock.
CREATE FUNCTION lock_managed_study_owner(study uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE a record;owners uuid[];owner_credential uuid;owner_user uuid;
BEGIN
  SELECT * INTO a FROM pedpsy.account_actor();IF NOT FOUND THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE='28000';END IF;
  IF a.actor_role='researcher' THEN RETURN pedpsy.lock_study_researcher();END IF;
  PERFORM pedpsy.lock_staff_operation('studies.configure');
  SELECT array_agg(c.id) INTO owners FROM pedpsy.study_memberships m JOIN pedpsy.researcher_credentials c ON c.user_id=m.user_id
    WHERE m.study_id=study AND m.role='researcher' AND m.status='active';
  IF coalesce(cardinality(owners),0)<>1 THEN RAISE EXCEPTION 'NOT_AVAILABLE' USING ERRCODE='P0002';END IF;
  owner_credential:=owners[1];
  SELECT user_id INTO owner_user FROM pedpsy.researcher_credentials WHERE id=owner_credential FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_AVAILABLE' USING ERRCODE='P0002';END IF;
  PERFORM 1 FROM pedpsy.users WHERE id=owner_user FOR SHARE;
  RETURN owner_credential;
END $$;
CREATE FUNCTION require_managed_study_owner(study uuid,owner_credential uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
BEGIN
  PERFORM 1 FROM pedpsy.study_memberships m JOIN pedpsy.researcher_credentials c ON c.user_id=m.user_id
    WHERE m.study_id=study AND m.role='researcher' AND m.status='active' AND c.id=owner_credential FOR SHARE OF m;
  IF NOT FOUND OR (EXISTS(SELECT 1 FROM pedpsy.account_actor() WHERE actor_role<>'researcher') AND
    (SELECT count(*) FROM pedpsy.study_memberships WHERE study_id=study AND role='researcher' AND status='active')<>1)
    THEN RAISE EXCEPTION 'NOT_AVAILABLE' USING ERRCODE='P0002';END IF;
END $$;
CREATE OR REPLACE FUNCTION lock_study_design(study uuid,write_design boolean,expected_version integer DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE a record;s record;owner_credential uuid;
BEGIN
  SELECT * INTO a FROM pedpsy.account_actor();IF NOT FOUND THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE='28000';END IF;
  IF a.actor_role='researcher' THEN PERFORM pedpsy.lock_study_researcher();
  ELSIF write_design THEN owner_credential:=pedpsy.lock_managed_study_owner(study);
  ELSE PERFORM pedpsy.lock_staff_operation('protocols.read');END IF;
  SELECT * INTO s FROM pedpsy.studies WHERE id=study AND dataset_kind='demo' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_AVAILABLE' USING ERRCODE='P0002';END IF;
  IF a.actor_role='researcher' THEN
    PERFORM 1 FROM pedpsy.study_memberships WHERE study_id=study AND user_id=a.user_id AND role='researcher' AND status='active' FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'NOT_AVAILABLE' USING ERRCODE='P0002';END IF;
  ELSIF write_design THEN PERFORM pedpsy.require_managed_study_owner(study,owner_credential);END IF;
  IF write_design AND (expected_version IS NULL OR expected_version<>s.design_version) THEN RAISE EXCEPTION 'DESIGN_CONFLICT' USING ERRCODE='P0001';END IF;
  IF write_design AND s.status<>'draft' THEN RAISE EXCEPTION 'DESIGN_FROZEN' USING ERRCODE='P0001';END IF;
END $$;
CREATE OR REPLACE FUNCTION constructor_audit(action text,study uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE a record;at_ms bigint;
BEGIN
  SELECT * INTO a FROM pedpsy.account_actor();IF NOT FOUND THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE='28000';END IF;
  at_ms:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
  INSERT INTO pedpsy.access_audit_events(id,at_ms,credential_id,study_id,action,outcome,reason,actor_role,resource_id)
    VALUES(gen_random_uuid(),at_ms,a.credential_id,study,action,'allow','STUDY_DESIGN',
      CASE WHEN a.actor_role IN ('administrator','superadministrator') THEN a.actor_role ELSE NULL END,study);
  IF a.actor_role='researcher' THEN UPDATE pedpsy.researcher_sessions SET last_seen_at_ms=at_ms WHERE token_hash=current_setting('app.session_hash',true);
  ELSE PERFORM pedpsy.touch_staff_identity();END IF;
END $$;
CREATE FUNCTION create_study_for_researcher(study uuid,owner_credential uuid,study_title text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE owner_user uuid;
BEGIN
  PERFORM pedpsy.lock_staff_operation('studies.configure');
  SELECT user_id INTO owner_user FROM pedpsy.researcher_credentials WHERE id=owner_credential AND status='active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_AVAILABLE' USING ERRCODE='P0002';END IF;
  PERFORM 1 FROM pedpsy.users WHERE id=owner_user AND status='active' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_AVAILABLE' USING ERRCODE='P0002';END IF;
  IF study_title IS NULL OR length(study_title)>200 OR length(trim(study_title))=0 OR study_title ~ '[[:cntrl:]]' THEN RAISE EXCEPTION 'INVALID_STUDY_INPUT' USING ERRCODE='22023';END IF;
  IF (SELECT count(*) FROM pedpsy.study_memberships WHERE user_id=owner_user AND role='researcher' AND status='active')>=500 THEN RAISE EXCEPTION 'DESIGN_LIMIT' USING ERRCODE='54000';END IF;
  INSERT INTO pedpsy.studies(id,title) VALUES(study,trim(study_title));
  INSERT INTO pedpsy.study_memberships(study_id,user_id,role) VALUES(study,owner_user,'researcher');
  PERFORM pedpsy.constructor_audit('studies.create',study);RETURN pedpsy.study_design_snapshot(study);
END $$;
CREATE OR REPLACE FUNCTION change_study_lifecycle(study uuid,expected_version integer,new_status text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE credential uuid;owner_user uuid;s record;quota integer;
BEGIN
  credential:=pedpsy.lock_managed_study_owner(study);PERFORM pedpsy.lock_study_design(study,false);
  PERFORM pedpsy.require_managed_study_owner(study,credential);
  SELECT user_id,active_study_quota INTO owner_user,quota FROM pedpsy.researcher_credentials WHERE id=credential;
  SELECT * INTO s FROM pedpsy.studies WHERE id=study;
  IF new_status IS NULL OR new_status NOT IN ('active','closed') THEN RAISE EXCEPTION 'INVALID_STUDY_INPUT' USING ERRCODE='22023';END IF;
  IF expected_version IS NULL OR expected_version<>s.design_version THEN RAISE EXCEPTION 'DESIGN_CONFLICT' USING ERRCODE='P0001';END IF;
  IF new_status=s.status THEN PERFORM pedpsy.constructor_audit('studies.lifecycle',study);RETURN pedpsy.study_design_snapshot(study);END IF;
  IF s.status='closed' OR new_status='active' AND s.status<>'draft' THEN RAISE EXCEPTION 'DESIGN_FROZEN' USING ERRCODE='P0001';END IF;
  IF new_status='active' THEN
    IF (SELECT count(*) FROM pedpsy.study_memberships WHERE study_id=study AND role='researcher' AND status='active')<>1
      OR EXISTS(SELECT 1 FROM pedpsy.attempts WHERE study_id=study) THEN RAISE EXCEPTION 'DESIGN_FROZEN' USING ERRCODE='P0001';END IF;
    IF (SELECT count(DISTINCT r.id) FROM pedpsy.studies r JOIN pedpsy.study_memberships m ON m.study_id=r.id
      WHERE m.user_id=owner_user AND m.role='researcher' AND m.status='active' AND r.status='active')>=quota THEN RAISE EXCEPTION 'STUDY_QUOTA' USING ERRCODE='P0001';END IF;
    IF NOT EXISTS(SELECT 1 FROM pedpsy.research_groups WHERE study_id=study AND status='active')
      OR NOT EXISTS(SELECT 1 FROM pedpsy.research_stages WHERE study_id=study AND status='active')
      OR EXISTS(SELECT 1 FROM pedpsy.research_groups g CROSS JOIN pedpsy.research_stages t WHERE g.study_id=study AND t.study_id=study AND g.status='active' AND t.status='active'
        AND NOT EXISTS(SELECT 1 FROM pedpsy.assignments x WHERE x.study_id=study AND x.group_id=g.id AND x.stage_id=t.id AND x.status='active'))
      OR EXISTS(SELECT 1 FROM pedpsy.assignments WHERE study_id=study AND status='active' AND NOT pedpsy.constructor_release_allowed(release_id)) THEN RAISE EXCEPTION 'DESIGN_INCOMPLETE' USING ERRCODE='P0001';END IF;
  END IF;
  UPDATE pedpsy.studies SET status=new_status WHERE id=study;RETURN pedpsy.finish_study_design(study,'studies.lifecycle');
END $$;

-- Preserve existing researcher FK/provenance; new staff creators are explicit.
ALTER TABLE group_invitations ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE group_invitations ADD COLUMN created_by_staff uuid REFERENCES staff_credentials(id);
ALTER TABLE group_invitations ADD CONSTRAINT group_invitation_creator_realm CHECK((created_by IS NOT NULL)::integer+(created_by_staff IS NOT NULL)::integer=1);
CREATE INDEX group_invitation_staff_creator ON group_invitations(created_by_staff,created_at_ms) WHERE created_by_staff IS NOT NULL;
CREATE OR REPLACE FUNCTION guard_group_invitation() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,pedpsy AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'revoke invitation instead' USING ERRCODE='23514';END IF;
  IF (NEW.id,NEW.study_id,NEW.group_id,NEW.token_hash,NEW.created_by,NEW.created_by_staff,NEW.created_at_ms,NEW.expires_at_ms)
    IS DISTINCT FROM (OLD.id,OLD.study_id,OLD.group_id,OLD.token_hash,OLD.created_by,OLD.created_by_staff,OLD.created_at_ms,OLD.expires_at_ms)
    OR OLD.status<>'active' OR NEW.status<>'revoked' OR NEW.revision<>OLD.revision+1 THEN RAISE EXCEPTION 'invitation identity frozen' USING ERRCODE='23514';END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION lock_group_invitation_owner(study uuid,target_group uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE credential uuid;
BEGIN
  credential:=pedpsy.lock_managed_study_owner(study);PERFORM pedpsy.lock_study_design(study,false);
  PERFORM pedpsy.require_managed_study_owner(study,credential);
  PERFORM 1 FROM pedpsy.research_groups WHERE study_id=study AND id=target_group FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_AVAILABLE' USING ERRCODE='P0002';END IF;
END $$;
CREATE OR REPLACE FUNCTION group_invitation_audit(operation text,study uuid,target uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE a record;at_ms bigint;
BEGIN
  SELECT * INTO a FROM pedpsy.account_actor();IF NOT FOUND THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE='28000';END IF;
  at_ms:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
  INSERT INTO pedpsy.access_audit_events(id,at_ms,credential_id,study_id,action,outcome,reason,actor_role,resource_id)
    VALUES(gen_random_uuid(),at_ms,a.credential_id,study,operation,'allow','GROUP_INVITATION',
      CASE WHEN a.actor_role IN ('administrator','superadministrator') THEN a.actor_role ELSE NULL END,target);
  IF a.actor_role='researcher' THEN UPDATE pedpsy.researcher_sessions SET last_seen_at_ms=at_ms WHERE token_hash=current_setting('app.session_hash',true);
  ELSE PERFORM pedpsy.touch_staff_identity();END IF;
END $$;
CREATE OR REPLACE FUNCTION create_group_invitation(study uuid,target_group uuid,target uuid,digest text,expiry bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE a record;at_ms bigint;old record;
BEGIN
  PERFORM pedpsy.lock_group_invitation_owner(study,target_group);SELECT * INTO a FROM pedpsy.account_actor();
  IF NOT EXISTS(SELECT 1 FROM pedpsy.studies WHERE id=study AND status='active' AND dataset_kind='demo')
    OR NOT EXISTS(SELECT 1 FROM pedpsy.research_groups WHERE study_id=study AND id=target_group AND status='active') THEN RAISE EXCEPTION 'NOT_AVAILABLE' USING ERRCODE='P0002';END IF;
  at_ms:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
  IF digest IS NULL OR digest !~ '^sha256:[a-f0-9]{64}$' OR expiry IS NULL OR expiry<=at_ms OR expiry>at_ms+2592000000 THEN RAISE EXCEPTION 'INVALID_REGISTRATION_INPUT' USING ERRCODE='22023';END IF;
  IF (SELECT count(*) FROM pedpsy.group_invitations WHERE (created_by=a.credential_id OR created_by_staff=a.credential_id) AND created_at_ms>at_ms-900000)>=10 THEN RAISE EXCEPTION 'INVITE_THROTTLED' USING ERRCODE='54000';END IF;
  IF (SELECT count(*) FROM pedpsy.group_invitations WHERE study_id=study AND group_id=target_group)>=100 THEN RAISE EXCEPTION 'INVITE_LIMIT' USING ERRCODE='54000';END IF;
  SELECT * INTO old FROM pedpsy.group_invitations WHERE study_id=study AND group_id=target_group AND status='active' FOR UPDATE;
  IF FOUND THEN
    IF old.expires_at_ms>at_ms THEN RAISE EXCEPTION 'INVITE_EXISTS' USING ERRCODE='P0001';END IF;
    IF old.revision>=2147483646 THEN RAISE EXCEPTION 'INVITE_LIMIT' USING ERRCODE='54000';END IF;
    UPDATE pedpsy.group_invitations SET status='revoked',revision=revision+1,revoked_at_ms=at_ms WHERE id=old.id;
    PERFORM pedpsy.group_invitation_audit('participants.invites.expire',study,old.id);
  END IF;
  INSERT INTO pedpsy.group_invitations(id,study_id,group_id,token_hash,created_by,created_by_staff,created_at_ms,expires_at_ms)
    VALUES(target,study,target_group,digest,CASE WHEN a.actor_role='researcher' THEN a.credential_id ELSE NULL END,
      CASE WHEN a.actor_role<>'researcher' THEN a.credential_id ELSE NULL END,at_ms,expiry);
  PERFORM pedpsy.group_invitation_audit('participants.invites.create',study,target);RETURN pedpsy.group_invitation_record(target);
END $$;
REVOKE ALL ON FUNCTION lock_managed_study_owner(uuid),require_managed_study_owner(uuid,uuid),create_study_for_researcher(uuid,uuid,text) FROM PUBLIC;
