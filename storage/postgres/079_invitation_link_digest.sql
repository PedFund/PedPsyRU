SET LOCAL search_path=pedpsy,pg_catalog;
-- 079: expose the invitation digest to the server adapter so a deterministic
-- link can be re-derived and shown later. The actor still needs the existing
-- researcher/staff policy gate; raw tokens are never stored.
CREATE OR REPLACE FUNCTION group_invitation_record(target uuid) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
  SELECT jsonb_build_object('id',id,'study_id',study_id,'group_id',group_id,'revision',revision,
    'status',status,'expires_at',expires_at_ms,'token_hash',token_hash) FROM pedpsy.group_invitations WHERE id=target
$$;
REVOKE ALL ON FUNCTION group_invitation_record(uuid) FROM PUBLIC;
