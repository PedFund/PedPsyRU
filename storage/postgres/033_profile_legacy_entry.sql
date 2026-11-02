SET LOCAL search_path=pedpsy,pg_catalog;
-- Existing completed/started legacy passports stay valid. A new participant
-- must not bypass a group's newer questions through the old passport endpoint.
CREATE FUNCTION require_legacy_profile_entry() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE scope record;binding record;configured jsonb;
BEGIN
  SELECT * INTO scope FROM pedpsy.lock_own_passport_scope();
  SELECT * INTO binding FROM pedpsy.participant_group_bindings WHERE study_id=scope.owner_study AND participant_id=scope.owner_participant;
  configured:=pedpsy.research_schema(scope.owner_study,binding.group_id);
  IF NOT EXISTS(SELECT 1 FROM pedpsy.participant_passports WHERE study_id=scope.owner_study AND participant_id=scope.owner_participant)
    AND configured->'fields' IS DISTINCT FROM scope.schema_fields THEN RAISE EXCEPTION 'PARTICIPATION_REQUIREMENTS_CHANGED' USING ERRCODE='P0001';END IF;
END $$;
ALTER FUNCTION save_own_passport(integer,integer,jsonb) RENAME TO save_own_passport_legacy;
CREATE FUNCTION save_own_passport(target_schema integer,expected_revision integer,new_answers jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
BEGIN PERFORM pedpsy.require_legacy_profile_entry();RETURN pedpsy.save_own_passport_legacy(target_schema,expected_revision,new_answers);END $$;
ALTER FUNCTION complete_own_passport(integer,integer) RENAME TO complete_own_passport_legacy;
CREATE FUNCTION complete_own_passport(target_schema integer,expected_revision integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
BEGIN PERFORM pedpsy.require_legacy_profile_entry();RETURN pedpsy.complete_own_passport_legacy(target_schema,expected_revision);END $$;
REVOKE ALL ON FUNCTION require_legacy_profile_entry(),save_own_passport_legacy(integer,integer,jsonb),save_own_passport(integer,integer,jsonb),complete_own_passport_legacy(integer,integer),complete_own_passport(integer,integer) FROM PUBLIC;
