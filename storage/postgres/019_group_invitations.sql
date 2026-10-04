SET LOCAL search_path=pedpsy,pg_catalog;
-- Recruiting link is not a participant credential or a one-use email token.
CREATE TABLE group_invitations (
  id uuid PRIMARY KEY, study_id uuid NOT NULL, group_id uuid NOT NULL,
  token_hash text NOT NULL UNIQUE CHECK(token_hash ~ '^sha256:[a-f0-9]{64}$'),
  status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','revoked')),
  revision integer NOT NULL DEFAULT 0 CHECK(revision BETWEEN 0 AND 2147483646),
  created_by uuid NOT NULL REFERENCES researcher_credentials(id),
  created_at_ms bigint NOT NULL CHECK(created_at_ms>=0),
  expires_at_ms bigint NOT NULL CHECK(expires_at_ms>created_at_ms AND expires_at_ms<=created_at_ms+2592000000),
  revoked_at_ms bigint CHECK(revoked_at_ms>=created_at_ms),
  CHECK((status='active' AND revoked_at_ms IS NULL) OR (status='revoked' AND revoked_at_ms IS NOT NULL)),
  FOREIGN KEY(study_id,group_id) REFERENCES research_groups(study_id,id),
  UNIQUE(study_id,group_id,id)
);
CREATE UNIQUE INDEX group_invitation_active ON group_invitations(study_id,group_id) WHERE status='active';
CREATE INDEX group_invitation_creator ON group_invitations(created_by,created_at_ms);
ALTER TABLE group_invitations ENABLE ROW LEVEL SECURITY;
-- No direct runtime privileges/policies, including SELECT of token digests.
REVOKE ALL ON group_invitations FROM PUBLIC;
CREATE FUNCTION guard_group_invitation() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,pedpsy AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'revoke invitation instead' USING ERRCODE='23514'; END IF;
  IF (NEW.id,NEW.study_id,NEW.group_id,NEW.token_hash,NEW.created_by,NEW.created_at_ms,NEW.expires_at_ms)
    IS DISTINCT FROM (OLD.id,OLD.study_id,OLD.group_id,OLD.token_hash,OLD.created_by,OLD.created_at_ms,OLD.expires_at_ms)
    OR OLD.status<>'active' OR NEW.status<>'revoked' OR NEW.revision<>OLD.revision+1
    THEN RAISE EXCEPTION 'invitation identity frozen' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER group_invitation_guard BEFORE UPDATE OR DELETE ON group_invitations FOR EACH ROW EXECUTE FUNCTION guard_group_invitation();

-- Consistent order: researcher credential/user/session -> study -> membership
-- -> group -> invite. Existing study lifecycle and credential revoke use the
-- same preceding locks; current authority is reread after a wait.
CREATE FUNCTION lock_group_invitation_owner(study uuid,target_group uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE a record;
BEGIN
  SELECT * INTO a FROM pedpsy.account_actor();
  IF NOT FOUND THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE='28000'; END IF;
  IF a.actor_role<>'researcher' THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
  PERFORM pedpsy.lock_study_design(study,false);
  PERFORM 1 FROM pedpsy.research_groups WHERE study_id=study AND id=target_group FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_AVAILABLE' USING ERRCODE='P0002'; END IF;
END $$;
CREATE FUNCTION group_invitation_record(target uuid) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
  SELECT jsonb_build_object('id',id,'study_id',study_id,'group_id',group_id,'revision',revision,
    'status',status,'expires_at',expires_at_ms) FROM pedpsy.group_invitations WHERE id=target
$$;
CREATE FUNCTION list_group_invitations(study uuid,target_group uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE data jsonb;
BEGIN
  PERFORM pedpsy.lock_group_invitation_owner(study,target_group);
  IF (SELECT count(*) FROM pedpsy.group_invitations WHERE study_id=study AND group_id=target_group)>100
    THEN RAISE EXCEPTION 'INVITE_LIMIT' USING ERRCODE='54000'; END IF;
  SELECT coalesce(jsonb_agg(pedpsy.group_invitation_record(id) ORDER BY created_at_ms,id),'[]'::jsonb)
    INTO data FROM pedpsy.group_invitations WHERE study_id=study AND group_id=target_group;
  PERFORM pedpsy.constructor_audit('participants.invites.list',study);
  RETURN data;
END $$;
CREATE FUNCTION group_invitation_policy_scope(study uuid,target_group uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE data jsonb;
BEGIN
  PERFORM pedpsy.lock_group_invitation_owner(study,target_group);
  SELECT jsonb_build_object('studyId',s.id,'groupId',g.id,'datasetKind',s.dataset_kind,
    'studyStatus',s.status,'groupStatus',g.status) INTO data
    FROM pedpsy.studies s JOIN pedpsy.research_groups g ON g.study_id=s.id WHERE s.id=study AND g.id=target_group;
  PERFORM pedpsy.constructor_audit('participants.invites.policy',study);
  RETURN data;
END $$;
CREATE FUNCTION create_group_invitation(study uuid,target_group uuid,target uuid,digest text,expiry bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE a record;at_ms bigint;old record;
BEGIN
  PERFORM pedpsy.lock_group_invitation_owner(study,target_group);
  SELECT * INTO a FROM pedpsy.account_actor();
  IF NOT EXISTS(SELECT 1 FROM pedpsy.studies WHERE id=study AND status='active' AND dataset_kind='demo')
    OR NOT EXISTS(SELECT 1 FROM pedpsy.research_groups WHERE study_id=study AND id=target_group AND status='active')
    THEN RAISE EXCEPTION 'NOT_AVAILABLE' USING ERRCODE='P0002'; END IF;
  at_ms:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
  IF digest IS NULL OR digest !~ '^sha256:[a-f0-9]{64}$' OR expiry IS NULL OR expiry<=at_ms OR expiry>at_ms+2592000000
    THEN RAISE EXCEPTION 'INVALID_REGISTRATION_INPUT' USING ERRCODE='22023'; END IF;
  IF (SELECT count(*) FROM pedpsy.group_invitations WHERE created_by=a.credential_id AND created_at_ms>at_ms-900000)>=10
    THEN RAISE EXCEPTION 'INVITE_THROTTLED' USING ERRCODE='54000'; END IF;
  IF (SELECT count(*) FROM pedpsy.group_invitations WHERE study_id=study AND group_id=target_group)>=100
    THEN RAISE EXCEPTION 'INVITE_LIMIT' USING ERRCODE='54000'; END IF;
  SELECT * INTO old FROM pedpsy.group_invitations WHERE study_id=study AND group_id=target_group AND status='active' FOR UPDATE;
  IF FOUND THEN
    IF old.expires_at_ms>at_ms THEN RAISE EXCEPTION 'INVITE_EXISTS' USING ERRCODE='P0001'; END IF;
    IF old.revision>=2147483646 THEN RAISE EXCEPTION 'INVITE_LIMIT' USING ERRCODE='54000'; END IF;
    UPDATE pedpsy.group_invitations SET status='revoked',revision=revision+1,revoked_at_ms=at_ms WHERE id=old.id;
    PERFORM pedpsy.constructor_audit('participants.invites.expire',study);
  END IF;
  INSERT INTO pedpsy.group_invitations(id,study_id,group_id,token_hash,created_by,created_at_ms,expires_at_ms)
    VALUES(target,study,target_group,digest,a.credential_id,at_ms,expiry);
  PERFORM pedpsy.constructor_audit('participants.invites.create',study);
  RETURN pedpsy.group_invitation_record(target);
END $$;
CREATE FUNCTION revoke_group_invitation(study uuid,target_group uuid,target uuid,expected_revision integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE row_invite record;at_ms bigint;
BEGIN
  PERFORM pedpsy.lock_group_invitation_owner(study,target_group);
  SELECT * INTO row_invite FROM pedpsy.group_invitations WHERE id=target AND study_id=study AND group_id=target_group FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_AVAILABLE' USING ERRCODE='P0002'; END IF;
  IF expected_revision IS NULL OR expected_revision<>row_invite.revision THEN RAISE EXCEPTION 'INVITE_CONFLICT' USING ERRCODE='P0001'; END IF;
  IF row_invite.status='revoked' THEN
    PERFORM pedpsy.constructor_audit('participants.invites.revoke',study); RETURN pedpsy.group_invitation_record(target);
  END IF;
  IF row_invite.revision>=2147483646 THEN RAISE EXCEPTION 'INVITE_LIMIT' USING ERRCODE='54000'; END IF;
  at_ms:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
  UPDATE pedpsy.group_invitations SET status='revoked',revision=revision+1,revoked_at_ms=at_ms WHERE id=target;
  PERFORM pedpsy.constructor_audit('participants.invites.revoke',study);
  RETURN pedpsy.group_invitation_record(target);
END $$;
REVOKE ALL ON FUNCTION guard_group_invitation(),lock_group_invitation_owner(uuid,uuid),group_invitation_record(uuid),
  group_invitation_policy_scope(uuid,uuid),list_group_invitations(uuid,uuid),create_group_invitation(uuid,uuid,uuid,text,bigint),revoke_group_invitation(uuid,uuid,uuid,integer) FROM PUBLIC;
