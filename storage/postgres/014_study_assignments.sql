SET LOCAL search_path=pedpsy,pg_catalog;
-- Technical allowlist of the existing synthetic package; NOT scientific publication/approval.
CREATE FUNCTION constructor_release_allowed(release uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM pedpsy.instrument_releases r WHERE r.id=release AND r.method_id='tki_ru_30_pairs'
   AND r.form_id='tki_ru_30_pairs_shared' AND r.form_version='0.1.0-draft' AND r.method_version_id='tki_ru_30_pairs@1.0.0'
   AND r.handler_version='tki-contract-0.3.0' AND r.contract_version='1.0' AND r.verification_state='key_verified' AND r.publication_state='draft'
   AND r.form_digest='sha256:10ea2173315f8c74091ec7f619fba7fe8d0ccfa005330cee8720054332daaad7'
   AND r.key_digest='sha256:45bc0c8a1b3f154fb3da5df629da6c42613609633594c4f5f54014a301cded7d'
   AND (SELECT count(*) FROM pedpsy.release_items i WHERE i.release_id=r.id)=30)
$$;
ALTER FUNCTION study_design_snapshot(uuid) RENAME TO study_base_snapshot;
CREATE FUNCTION study_design_snapshot(study uuid) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
 SELECT pedpsy.study_base_snapshot(study)||jsonb_build_object('catalog',coalesce((SELECT jsonb_agg(jsonb_build_object('id',r.id,'method_id',r.method_id,
   'form_version',r.form_version,'method_version_id',r.method_version_id,'handler_version',r.handler_version,
   'verification_state',r.verification_state,'publication_state',r.publication_state) ORDER BY r.id)
   FROM pedpsy.instrument_releases r WHERE pedpsy.constructor_release_allowed(r.id)),'[]'::jsonb))
$$;
CREATE FUNCTION configure_study_assignments(study uuid,expected_version integer,target_group uuid,target_stage uuid,releases uuid[]) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
BEGIN
  PERFORM pedpsy.require_mutable_design(study,expected_version);
  IF releases IS NULL OR cardinality(releases)>10 OR array_position(releases,NULL) IS NOT NULL
    OR (SELECT count(DISTINCT id) FROM unnest(releases) id)<>cardinality(releases) THEN RAISE EXCEPTION 'INVALID_STUDY_INPUT' USING ERRCODE='22023';END IF;
  IF NOT EXISTS(SELECT 1 FROM pedpsy.research_groups WHERE study_id=study AND id=target_group AND status='active')
    OR NOT EXISTS(SELECT 1 FROM pedpsy.research_stages WHERE study_id=study AND id=target_stage AND status='active') THEN RAISE EXCEPTION 'NOT_AVAILABLE' USING ERRCODE='P0002';END IF;
  IF EXISTS(SELECT 1 FROM unnest(releases) id WHERE NOT pedpsy.constructor_release_allowed(id)) THEN RAISE EXCEPTION 'NOT_AVAILABLE' USING ERRCODE='P0002';END IF;
  PERFORM 1 FROM pedpsy.instrument_releases WHERE id=ANY(releases) ORDER BY id FOR SHARE;
  DELETE FROM pedpsy.assignments WHERE study_id=study AND group_id=target_group AND stage_id=target_stage AND NOT release_id=ANY(releases);
  INSERT INTO pedpsy.assignments(id,study_id,group_id,stage_id,release_id)
    SELECT gen_random_uuid(),study,target_group,target_stage,id FROM unnest(releases) id
    ON CONFLICT(study_id,group_id,stage_id,release_id) DO UPDATE SET status='active',updated_at=clock_timestamp();
  RETURN pedpsy.finish_study_design(study,'studies.assignments');
END $$;
REVOKE ALL ON FUNCTION constructor_release_allowed(uuid),study_base_snapshot(uuid),study_design_snapshot(uuid),configure_study_assignments(uuid,integer,uuid,uuid,uuid[]) FROM PUBLIC;
