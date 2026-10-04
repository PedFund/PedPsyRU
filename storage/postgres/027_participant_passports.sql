SET LOCAL search_path=pedpsy,pg_catalog;
-- Own synthetic passport only. No staff impersonation, contact export,
-- scientific processing, clinical records or consent/availability bypass.
CREATE FUNCTION passport_text_trim(value text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
  SELECT btrim(value,' '||chr(160)||chr(5760)||chr(8192)||chr(8193)||chr(8194)||chr(8195)||chr(8196)||chr(8197)||chr(8198)||chr(8199)||chr(8200)||chr(8201)||chr(8202)||chr(8232)||chr(8233)||chr(8239)||chr(8287)||chr(12288)||chr(65279))
$$;
CREATE FUNCTION passport_values_valid(fields jsonb,answers jsonb,complete boolean DEFAULT false) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,pedpsy AS $$
DECLARE field jsonb;key text;answer jsonb;number numeric;text_value text;
BEGIN
  IF fields IS NULL OR jsonb_typeof(fields)<>'array' OR answers IS NULL OR jsonb_typeof(answers)<>'object' OR complete IS NULL THEN RETURN false;END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(answers))>8 THEN RETURN false;END IF;
  FOR key,answer IN SELECT * FROM jsonb_each(answers) LOOP
    SELECT value INTO field FROM jsonb_array_elements(fields) WHERE value->>'key'=key;
    IF NOT FOUND THEN RETURN false;END IF;
    IF field->>'kind'='integer' THEN
      IF jsonb_typeof(answer)<>'number' THEN RETURN false;END IF;
      number:=(answer#>>'{}')::numeric;
      IF number<>trunc(number) OR number<(field->>'min')::numeric OR number>(field->>'max')::numeric THEN RETURN false;END IF;
    ELSIF field->>'kind'='text' THEN
      IF jsonb_typeof(answer)<>'string' THEN RETURN false;END IF;text_value:=answer#>>'{}';
      IF length(text_value) NOT BETWEEN 1 AND (field->>'max_length')::integer OR text_value ~ '[[:cntrl:]]'
        OR text_value IS DISTINCT FROM pedpsy.passport_text_trim(text_value) OR pedpsy.passport_text_trim(text_value)='' THEN RETURN false;END IF;
    ELSIF field->>'kind'='single_choice' THEN
      IF jsonb_typeof(answer)<>'string' OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(field->'options') WHERE value->>'value'=answer#>>'{}') THEN RETURN false;END IF;
    ELSE RETURN false;END IF;
  END LOOP;
  IF complete AND EXISTS(SELECT 1 FROM jsonb_array_elements(fields) WHERE (value->>'required')::boolean AND NOT (answers ? (value->>'key'))) THEN RETURN false;END IF;
  RETURN true;
END $$;
CREATE TABLE participant_passports(
  study_id uuid NOT NULL,participant_id uuid NOT NULL,schema_version integer NOT NULL,
  revision integer NOT NULL CHECK(revision BETWEEN 1 AND 2147483646),
  status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','completed')),
  answers jsonb NOT NULL CHECK(jsonb_typeof(answers)='object'),
  created_at_ms bigint NOT NULL CHECK(created_at_ms>=0),updated_at_ms bigint NOT NULL CHECK(updated_at_ms>=created_at_ms),
  completed_at_ms bigint CHECK(completed_at_ms>=created_at_ms AND completed_at_ms=updated_at_ms),
  CHECK((status='draft' AND completed_at_ms IS NULL) OR (status='completed' AND completed_at_ms IS NOT NULL)),
  PRIMARY KEY(study_id,participant_id),
  FOREIGN KEY(study_id,participant_id) REFERENCES participant_group_bindings(study_id,participant_id),
  FOREIGN KEY(study_id,schema_version) REFERENCES passport_schema_versions(study_id,schema_version)
);
CREATE INDEX participant_passport_schema ON participant_passports(study_id,schema_version);
CREATE FUNCTION guard_participant_passport() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,pedpsy AS $$
DECLARE fields jsonb;
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'passport identity frozen' USING ERRCODE='23514';END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.revision<>1 OR NEW.status<>'draft' OR NEW.updated_at_ms<>NEW.created_at_ms THEN RAISE EXCEPTION 'passport initial state invalid' USING ERRCODE='23514';END IF;
  ELSIF OLD.status<>'draft' OR (NEW.study_id,NEW.participant_id,NEW.schema_version,NEW.created_at_ms) IS DISTINCT FROM (OLD.study_id,OLD.participant_id,OLD.schema_version,OLD.created_at_ms)
    OR NEW.revision<>OLD.revision+1 OR NEW.updated_at_ms<OLD.updated_at_ms OR (NEW.status='completed' AND NEW.answers IS DISTINCT FROM OLD.answers) THEN
    RAISE EXCEPTION 'passport state frozen' USING ERRCODE='23514';
  END IF;
  SELECT v.fields INTO fields FROM pedpsy.passport_schema_versions v WHERE v.study_id=NEW.study_id AND v.schema_version=NEW.schema_version;
  -- A missing parent is left to the scoped FK, not disguised as a value error.
  IF FOUND AND NOT pedpsy.passport_values_valid(fields,NEW.answers,NEW.status='completed') THEN RAISE EXCEPTION 'INVALID_PASSPORT_VALUES' USING ERRCODE='22023';END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER participant_passport_guard BEFORE INSERT OR UPDATE OR DELETE ON participant_passports FOR EACH ROW EXECUTE FUNCTION guard_participant_passport();
ALTER TABLE participant_passports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON participant_passports FROM PUBLIC;

CREATE FUNCTION assert_own_passport_session() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE at_ms bigint:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
BEGIN
  -- Existing session_actor uses statement time. Recheck wall time after EVERY
  -- potentially blocking row lock; a session expiring while waiting cannot act.
  IF NOT EXISTS(SELECT 1 FROM pedpsy.participant_sessions s JOIN pedpsy.participant_credentials c ON (c.id,c.study_id,c.participant_id)=(s.credential_id,s.study_id,s.participant_id)
    JOIN pedpsy.participants p ON (p.study_id,p.id)=(c.study_id,c.participant_id) JOIN pedpsy.studies r ON r.id=c.study_id
    WHERE s.token_hash=current_setting('app.session_hash',true) AND s.revoked_at_ms IS NULL AND s.credential_version=c.version
      AND c.status='active' AND p.status='active' AND r.status='active' AND r.dataset_kind='demo'
      AND at_ms>=s.last_seen_at_ms AND at_ms<s.expires_at_ms AND at_ms-s.last_seen_at_ms<600000) THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE='28000';
  END IF;
END $$;
CREATE FUNCTION lock_own_passport_scope() RETURNS TABLE(owner_study uuid,owner_participant uuid,current_schema integer,schema_fields jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE actor record;binding record;g record;policy record;notice record;contact record;pointer record;schema_record record;
BEGIN
  PERFORM pedpsy.lock_participant_identity();SELECT * INTO actor FROM pedpsy.session_actor() WHERE actor_role='participant';
  SELECT * INTO binding FROM pedpsy.participant_group_bindings WHERE study_id=actor.study_id AND participant_id=actor.participant_id FOR SHARE;
  SELECT * INTO g FROM pedpsy.research_groups WHERE study_id=actor.study_id AND id=binding.group_id FOR SHARE;
  SELECT * INTO policy FROM pedpsy.study_contact_policies WHERE study_id=actor.study_id FOR SHARE;
  SELECT * INTO notice FROM pedpsy.contact_notices WHERE version=policy.notice_version FOR SHARE;
  SELECT * INTO contact FROM pedpsy.participant_contacts WHERE study_id=actor.study_id AND participant_id=actor.participant_id FOR SHARE;
  SELECT * INTO pointer FROM pedpsy.study_passport_schemas WHERE study_id=actor.study_id FOR SHARE;
  SELECT * INTO schema_record FROM pedpsy.passport_schema_versions WHERE study_id=actor.study_id AND schema_version=pointer.schema_version FOR SHARE;
  PERFORM pedpsy.assert_own_passport_session();
  IF binding.participant_id IS NULL OR g.id IS NULL OR g.status<>'active' OR contact.id IS NULL OR contact.status<>'active' OR notice.version IS NULL
    OR notice.legal_status<>'synthetic_only' OR schema_record.schema_version IS NULL THEN RAISE EXCEPTION 'NOT_AVAILABLE' USING ERRCODE='P0002';END IF;
  IF NOT EXISTS(SELECT 1 FROM pedpsy.participant_contact_acceptances WHERE study_id=actor.study_id AND contact_id=contact.id AND notice_version=notice.version) THEN
    RAISE EXCEPTION 'PARTICIPATION_REQUIREMENTS_CHANGED' USING ERRCODE='P0001';
  END IF;
  -- No active recruitment invite required for an already accepted identity.
  RETURN QUERY SELECT actor.study_id,actor.participant_id,pointer.schema_version,schema_record.fields;
END $$;
CREATE FUNCTION own_passport_snapshot(study uuid,participant uuid,target_schema integer,fields jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE p record;
BEGIN
  SELECT * INTO p FROM pedpsy.participant_passports WHERE study_id=study AND participant_id=participant;
  RETURN jsonb_build_object('study_id',study,'schema_version',target_schema,'fields',fields,'status',coalesce(p.status,'not_started'),
    'revision',coalesce(p.revision,0),'values',coalesce(p.answers,'{}'::jsonb));
END $$;
CREATE FUNCTION own_passport_audit(action_code text,participant uuid,field_count integer) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE actor record;
BEGIN
  IF action_code IS NULL OR field_count IS NULL OR action_code NOT IN ('participants.passport.read','participants.passport.save','participants.passport.complete') OR field_count NOT BETWEEN 0 AND 8 THEN RAISE EXCEPTION 'INVALID_AUDIT_ACTION';END IF;
  PERFORM pedpsy.assert_own_passport_session();SELECT * INTO actor FROM pedpsy.session_actor() WHERE actor_role='participant';
  IF actor.participant_id IS DISTINCT FROM participant THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE='28000';END IF;
  INSERT INTO pedpsy.access_audit_events(id,at_ms,credential_id,study_id,action,outcome,reason,resource_id,record_count)
    VALUES(gen_random_uuid(),floor(extract(epoch FROM clock_timestamp())*1000)::bigint,actor.credential_id,actor.study_id,action_code,'allow','OWN_SCOPE',participant,field_count);
  PERFORM pedpsy.assert_own_passport_session();PERFORM pedpsy.touch_session();
END $$;
CREATE FUNCTION read_own_passport() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE scope record;p record;
BEGIN
  SELECT * INTO scope FROM pedpsy.lock_own_passport_scope();
  SELECT * INTO p FROM pedpsy.participant_passports WHERE study_id=scope.owner_study AND participant_id=scope.owner_participant FOR SHARE;
  PERFORM pedpsy.assert_own_passport_session();
  IF p.schema_version IS NOT NULL AND p.schema_version<>scope.current_schema THEN RAISE EXCEPTION 'PARTICIPATION_REQUIREMENTS_CHANGED' USING ERRCODE='P0001';END IF;
  PERFORM pedpsy.own_passport_audit('participants.passport.read',scope.owner_participant,(SELECT count(*)::integer FROM jsonb_object_keys(coalesce(p.answers,'{}'::jsonb))));
  RETURN pedpsy.own_passport_snapshot(scope.owner_study,scope.owner_participant,scope.current_schema,scope.schema_fields);
END $$;
CREATE FUNCTION save_own_passport(target_schema integer,expected_revision integer,new_answers jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE scope record;p record;at_ms bigint;
BEGIN
  SELECT * INTO scope FROM pedpsy.lock_own_passport_scope();
  SELECT * INTO p FROM pedpsy.participant_passports WHERE study_id=scope.owner_study AND participant_id=scope.owner_participant FOR UPDATE;
  PERFORM pedpsy.assert_own_passport_session();
  IF target_schema IS NULL OR target_schema IS DISTINCT FROM scope.current_schema OR (p.schema_version IS NOT NULL AND p.schema_version<>scope.current_schema) THEN RAISE EXCEPTION 'PARTICIPATION_REQUIREMENTS_CHANGED' USING ERRCODE='P0001';END IF;
  IF expected_revision IS NULL OR expected_revision<0 OR expected_revision>2147483646 THEN RAISE EXCEPTION 'INVALID_PASSPORT_VALUES' USING ERRCODE='22023';END IF;
  IF coalesce(p.revision,0)<>expected_revision THEN RAISE EXCEPTION 'PASSPORT_CONFLICT' USING ERRCODE='P0001';END IF;
  IF p.status='completed' THEN RAISE EXCEPTION 'PASSPORT_FROZEN' USING ERRCODE='P0001';END IF;
  IF NOT pedpsy.passport_values_valid(scope.schema_fields,new_answers) THEN RAISE EXCEPTION 'INVALID_PASSPORT_VALUES' USING ERRCODE='22023';END IF;
  at_ms:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
  IF p.revision IS NULL THEN
    INSERT INTO pedpsy.participant_passports(study_id,participant_id,schema_version,revision,answers,created_at_ms,updated_at_ms)
      VALUES(scope.owner_study,scope.owner_participant,target_schema,1,new_answers,at_ms,at_ms);
  ELSIF p.answers IS DISTINCT FROM new_answers THEN
    IF p.revision>=2147483646 THEN RAISE EXCEPTION 'PASSPORT_LIMIT' USING ERRCODE='54000';END IF;
    UPDATE pedpsy.participant_passports SET answers=new_answers,revision=revision+1,updated_at_ms=at_ms WHERE study_id=scope.owner_study AND participant_id=scope.owner_participant;
  END IF;
  PERFORM pedpsy.own_passport_audit('participants.passport.save',scope.owner_participant,(SELECT count(*)::integer FROM jsonb_object_keys(new_answers)));
  RETURN pedpsy.own_passport_snapshot(scope.owner_study,scope.owner_participant,scope.current_schema,scope.schema_fields);
END $$;
CREATE FUNCTION complete_own_passport(target_schema integer,expected_revision integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE scope record;p record;at_ms bigint;
BEGIN
  SELECT * INTO scope FROM pedpsy.lock_own_passport_scope();
  SELECT * INTO p FROM pedpsy.participant_passports WHERE study_id=scope.owner_study AND participant_id=scope.owner_participant FOR UPDATE;
  PERFORM pedpsy.assert_own_passport_session();
  IF target_schema IS NULL OR target_schema IS DISTINCT FROM scope.current_schema OR (p.schema_version IS NOT NULL AND p.schema_version<>scope.current_schema) THEN RAISE EXCEPTION 'PARTICIPATION_REQUIREMENTS_CHANGED' USING ERRCODE='P0001';END IF;
  IF expected_revision IS NULL OR expected_revision<0 OR expected_revision>2147483646 THEN RAISE EXCEPTION 'INVALID_PASSPORT_VALUES' USING ERRCODE='22023';END IF;
  IF p.status='completed' THEN
    -- Immutable completed values permit a lost-response retry of only the last
    -- transition, not a stale draft write or an arbitrary old revision.
    IF expected_revision NOT IN (p.revision,p.revision-1) THEN RAISE EXCEPTION 'PASSPORT_CONFLICT' USING ERRCODE='P0001';END IF;
  ELSE
    IF coalesce(p.revision,0)<>expected_revision THEN RAISE EXCEPTION 'PASSPORT_CONFLICT' USING ERRCODE='P0001';END IF;
    IF p.revision IS NULL OR NOT pedpsy.passport_values_valid(scope.schema_fields,p.answers,true) THEN RAISE EXCEPTION 'PASSPORT_INCOMPLETE' USING ERRCODE='P0001';END IF;
    IF p.revision>=2147483646 THEN RAISE EXCEPTION 'PASSPORT_LIMIT' USING ERRCODE='54000';END IF;
    at_ms:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
    UPDATE pedpsy.participant_passports SET status='completed',revision=revision+1,updated_at_ms=at_ms,completed_at_ms=at_ms WHERE study_id=scope.owner_study AND participant_id=scope.owner_participant;
  END IF;
  PERFORM pedpsy.own_passport_audit('participants.passport.complete',scope.owner_participant,(SELECT count(*)::integer FROM jsonb_object_keys(p.answers)));
  RETURN pedpsy.own_passport_snapshot(scope.owner_study,scope.owner_participant,scope.current_schema,scope.schema_fields);
END $$;
REVOKE ALL ON FUNCTION passport_text_trim(text),passport_values_valid(jsonb,jsonb,boolean),guard_participant_passport(),assert_own_passport_session(),lock_own_passport_scope(),own_passport_snapshot(uuid,uuid,integer,jsonb),own_passport_audit(text,uuid,integer),read_own_passport(),save_own_passport(integer,integer,jsonb),complete_own_passport(integer,integer) FROM PUBLIC;
