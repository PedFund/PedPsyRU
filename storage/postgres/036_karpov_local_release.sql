SET LOCAL search_path=pedpsy,pg_catalog;
-- Explicitly pin one additional synthetic local method. No general imported
-- executable dispatch, scientific approval or publication permission.
ALTER TABLE instrument_releases DROP CONSTRAINT instrument_releases_method_id_check,DROP CONSTRAINT instrument_releases_method_version_id_check,DROP CONSTRAINT instrument_releases_handler_version_check,DROP CONSTRAINT instrument_releases_key_digest_check,DROP CONSTRAINT instrument_releases_verification_state_check;
ALTER TABLE instrument_releases ADD CONSTRAINT instrument_release_pinned_identity CHECK(
 (method_id='tki_ru_30_pairs' AND method_version_id='tki_ru_30_pairs@1.0.0' AND handler_version='tki-contract-0.3.0' AND key_digest='sha256:45bc0c8a1b3f154fb3da5df629da6c42613609633594c4f5f54014a301cded7d' AND verification_state='key_verified') OR
 (method_id='reflexivity_karpov_27' AND method_version_id='reflexivity_karpov_27@1.0.0-local' AND handler_version='karpov-local-1.0.0' AND key_digest='sha256:8ab419afb7cc4123bf3297090e15a08c96b55454ff2cd18e2d20e61863ae5d4a' AND verification_state='legacy_checked' AND form_id='reflexivity_karpov_27_shared_local' AND form_version='1.0.0-draft' AND form_digest='sha256:d2a082a861ada76c4b982769d1f45cbc162dc21f8be1f7960b1254cbf718d119'));
ALTER TABLE release_items DROP CONSTRAINT release_items_options_check;
ALTER TABLE release_items ADD CONSTRAINT release_item_pinned_choices CHECK(coalesce(
 (jsonb_typeof(options)='array' AND jsonb_array_length(options)=2 AND options->0->>'value'='A' AND options->1->>'value'='B' AND jsonb_typeof(options->0->'text')='string' AND jsonb_typeof(options->1->'text')='string') OR
 (jsonb_typeof(options)='array' AND jsonb_array_length(options)=7 AND options->0->>'value'='1' AND options->1->>'value'='2' AND options->2->>'value'='3' AND options->3->>'value'='4' AND options->4->>'value'='5' AND options->5->>'value'='6' AND options->6->>'value'='7' AND jsonb_typeof(options->0->'text')='string' AND jsonb_typeof(options->1->'text')='string' AND jsonb_typeof(options->2->'text')='string' AND jsonb_typeof(options->3->'text')='string' AND jsonb_typeof(options->4->'text')='string' AND jsonb_typeof(options->5->'text')='string' AND jsonb_typeof(options->6->'text')='string'),false));
ALTER TABLE responses DROP CONSTRAINT responses_value_check;
ALTER TABLE responses ADD CONSTRAINT response_known_choice CHECK(value IN ('A','B','1','2','3','4','5','6','7'));
ALTER TABLE attempt_results DROP CONSTRAINT attempt_results_handler_version_check,DROP CONSTRAINT attempt_results_key_digest_check,DROP CONSTRAINT attempt_results_check;
ALTER TABLE attempt_results ADD CONSTRAINT result_pinned_payload CHECK(coalesce(payload->>'status'='scored' AND payload->>'contract_version'=contract_version AND payload->>'handler_version'=handler_version AND payload->'calculation'->>'key_digest'=key_digest AND (
 (payload->>'method_version_id'='tki_ru_30_pairs@1.0.0' AND handler_version='tki-contract-0.3.0' AND key_digest='sha256:45bc0c8a1b3f154fb3da5df629da6c42613609633594c4f5f54014a301cded7d') OR
 (payload->>'method_version_id'='reflexivity_karpov_27@1.0.0-local' AND handler_version='karpov-local-1.0.0' AND key_digest='sha256:8ab419afb7cc4123bf3297090e15a08c96b55454ff2cd18e2d20e61863ae5d4a')),false));
CREATE FUNCTION guard_result_release_identity() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pedpsy.instrument_releases r WHERE r.id=NEW.release_id AND r.method_version_id=NEW.payload->>'method_version_id' AND r.handler_version=NEW.handler_version AND r.contract_version=NEW.contract_version AND r.key_digest=NEW.key_digest) THEN RAISE EXCEPTION 'result release mismatch' USING ERRCODE='23514';END IF;RETURN NEW;
END $$;
CREATE TRIGGER result_release_identity BEFORE INSERT ON attempt_results FOR EACH ROW EXECUTE FUNCTION guard_result_release_identity();
REVOKE ALL ON FUNCTION guard_result_release_identity() FROM PUBLIC;
CREATE OR REPLACE FUNCTION constructor_release_allowed(release uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM pedpsy.instrument_releases r WHERE r.id=release AND r.method_id='tki_ru_30_pairs'
   AND r.form_id='tki_ru_30_pairs_shared' AND r.form_version='0.1.0-draft' AND r.method_version_id='tki_ru_30_pairs@1.0.0'
   AND r.handler_version='tki-contract-0.3.0' AND r.contract_version='1.0' AND r.verification_state='key_verified' AND r.publication_state='draft'
   AND r.form_digest='sha256:10ea2173315f8c74091ec7f619fba7fe8d0ccfa005330cee8720054332daaad7'
   AND r.key_digest='sha256:45bc0c8a1b3f154fb3da5df629da6c42613609633594c4f5f54014a301cded7d'
   AND (SELECT count(*) FROM pedpsy.release_items i WHERE i.release_id=r.id)=30) OR EXISTS(SELECT 1 FROM pedpsy.instrument_releases r WHERE r.id=release AND r.method_id='reflexivity_karpov_27' AND r.method_version_id='reflexivity_karpov_27@1.0.0-local' AND r.handler_version='karpov-local-1.0.0' AND r.verification_state='legacy_checked' AND r.publication_state='draft' AND r.form_digest='sha256:d2a082a861ada76c4b982769d1f45cbc162dc21f8be1f7960b1254cbf718d119' AND r.key_digest='sha256:8ab419afb7cc4123bf3297090e15a08c96b55454ff2cd18e2d20e61863ae5d4a' AND (SELECT count(*) FROM pedpsy.release_items WHERE release_id=r.id)=27 AND NOT EXISTS(SELECT 1 FROM pedpsy.release_items i WHERE i.release_id=r.id AND (jsonb_array_length(i.options)<>7 OR i.ordinal>27)))
$$;
CREATE OR REPLACE FUNCTION guard_assignment() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,pedpsy AS $$
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') AND EXISTS(SELECT 1 FROM pedpsy.attempts WHERE assignment_id=OLD.id) THEN
    IF TG_OP='DELETE' OR (NEW.id,NEW.study_id,NEW.group_id,NEW.stage_id,NEW.release_id) IS DISTINCT FROM (OLD.id,OLD.study_id,OLD.group_id,OLD.stage_id,OLD.release_id)
      THEN RAISE EXCEPTION 'assignment scope is frozen' USING ERRCODE='23514'; END IF;
  END IF;
  IF TG_OP<>'DELETE' AND (SELECT count(*) FROM pedpsy.release_items WHERE release_id=NEW.release_id)<>(CASE WHEN (SELECT method_id FROM pedpsy.instrument_releases WHERE id=NEW.release_id)='reflexivity_karpov_27' THEN 27 ELSE 30 END) THEN RAISE EXCEPTION 'release requires its pinned item count' USING ERRCODE='23514'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
CREATE OR REPLACE FUNCTION guard_attempt() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,pedpsy AS $$
BEGIN
  IF TG_OP='INSERT' THEN IF NEW.status<>'draft' THEN RAISE EXCEPTION 'new attempt must be draft' USING ERRCODE='23514'; END IF; RETURN NEW; END IF;
  IF OLD.status='completed' THEN RAISE EXCEPTION 'completed attempt is immutable' USING ERRCODE='23514'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  IF (NEW.id,NEW.study_id,NEW.enrollment_id,NEW.assignment_id,NEW.group_id,NEW.stage_id,NEW.release_id) IS DISTINCT FROM
    (OLD.id,OLD.study_id,OLD.enrollment_id,OLD.assignment_id,OLD.group_id,OLD.stage_id,OLD.release_id) THEN RAISE EXCEPTION 'attempt scope is frozen' USING ERRCODE='23514'; END IF;
  IF NEW.status='completed' THEN
    IF (SELECT count(*) FROM pedpsy.responses WHERE attempt_id=OLD.id)<>(CASE WHEN (SELECT method_id FROM pedpsy.instrument_releases WHERE id=NEW.release_id)='reflexivity_karpov_27' THEN 27 ELSE 30 END) OR NEW.revision<>OLD.revision+1 OR NOT EXISTS
      (SELECT 1 FROM pedpsy.attempt_results WHERE id=NEW.completion_result_id AND attempt_id=OLD.id AND input_revision=OLD.revision)
      THEN RAISE EXCEPTION 'completion requires full snapshot and matching result' USING ERRCODE='23514'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION guard_response() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy AS $$
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') AND COALESCE((SELECT status FROM pedpsy.attempts WHERE id=OLD.attempt_id),'missing')<>'draft'
    THEN RAISE EXCEPTION 'response requires draft' USING ERRCODE='23514'; END IF;
  IF TG_OP IN ('INSERT','UPDATE') AND COALESCE((SELECT status FROM pedpsy.attempts WHERE id=NEW.attempt_id),'missing')<>'draft'
    THEN RAISE EXCEPTION 'response requires draft' USING ERRCODE='23514'; END IF;
  IF TG_OP IN ('INSERT','UPDATE') AND NOT EXISTS(SELECT 1 FROM pedpsy.release_items i CROSS JOIN LATERAL jsonb_array_elements(i.options) o WHERE i.release_id=NEW.release_id AND i.item_id=NEW.item_id AND o->>'value'=NEW.value) THEN RAISE EXCEPTION 'choice does not belong to pinned item' USING ERRCODE='23514';END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
REVOKE ALL ON FUNCTION guard_assignment(),guard_attempt(),guard_response() FROM PUBLIC;
