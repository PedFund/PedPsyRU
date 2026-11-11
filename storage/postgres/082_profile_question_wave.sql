SET LOCAL search_path=pedpsy,pg_catalog;
-- 081: adding a question to an active study starts a new profile wave.
-- A completed profile becomes a draft for the newest schema, keeping every
-- previous answer; admission stays closed until that draft is completed.
CREATE OR REPLACE FUNCTION own_profile(action text,target_schema integer,expected_revision integer,new_answers jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE scope record;binding record;p record;old record;latest record;schema jsonb;fields jsonb;answers jsonb;revision integer;state text;v integer;current_v integer;current_fields jsonb;
BEGIN
  SELECT * INTO scope FROM pedpsy.lock_own_passport_scope();
  SELECT * INTO binding FROM pedpsy.participant_group_bindings WHERE study_id=scope.owner_study AND participant_id=scope.owner_participant;
  SELECT * INTO p FROM pedpsy.research_profile_drafts WHERE study_id=scope.owner_study AND participant_id=scope.owner_participant FOR UPDATE;
  SELECT * INTO old FROM pedpsy.participant_passports WHERE study_id=scope.owner_study AND participant_id=scope.owner_participant FOR SHARE;
  SELECT * INTO latest FROM pedpsy.research_profile_history WHERE study_id=scope.owner_study AND participant_id=scope.owner_participant ORDER BY revision DESC LIMIT 1;
  schema:=pedpsy.research_schema(scope.owner_study,binding.group_id);
  current_fields:=schema->'fields';current_v:=(schema->>'schema_version')::integer;
  IF p.revision IS NOT NULL THEN
    fields:=p.fields;v:=p.schema_version;revision:=p.revision;state:=p.status;answers:=p.answers;
  ELSIF latest.revision IS NOT NULL THEN
    fields:=latest.fields;v:=latest.schema_version;revision:=latest.revision;state:='completed';answers:=latest.answers;
  ELSIF old.revision IS NOT NULL THEN
    SELECT f.fields INTO fields FROM pedpsy.passport_schema_versions f WHERE f.study_id=scope.owner_study AND f.schema_version=old.schema_version;
    v:=old.schema_version;revision:=old.revision;state:=old.status;answers:=old.answers;
  ELSE
    fields:=current_fields;v:=current_v;revision:=0;state:='not_started';answers:='{}'::jsonb;
  END IF;
  -- New question added while this participant already has an older completed
  -- profile: keep the answers, open a draft for the current schema, and block
  -- admission until the new required field is completed.
  IF state='completed' AND v<current_v THEN
    revision:=revision+1;v:=current_v;fields:=current_fields;state:='draft';
  ELSIF state='draft' AND v<current_v THEN
    v:=current_v;fields:=current_fields;state:='draft';
  END IF;
  IF action NOT IN ('read','restart','save','complete') OR action IS NULL THEN RAISE EXCEPTION 'INVALID_PASSPORT_VALUES' USING ERRCODE='22023';END IF;
  IF action<>'read' THEN
    IF expected_revision IS DISTINCT FROM revision THEN RAISE EXCEPTION 'PASSPORT_CONFLICT' USING ERRCODE='P0001';END IF;
    IF target_schema IS DISTINCT FROM v THEN RAISE EXCEPTION 'PARTICIPATION_REQUIREMENTS_CHANGED' USING ERRCODE='P0001';END IF;
    IF revision>=2147483645 THEN RAISE EXCEPTION 'PASSPORT_LIMIT' USING ERRCODE='54000';END IF;
    IF action='restart' THEN
      IF state<>'completed' THEN RAISE EXCEPTION 'PASSPORT_CONFLICT' USING ERRCODE='P0001';END IF;
      IF p.revision IS NULL AND latest.revision IS NULL AND old.revision IS NOT NULL THEN
        INSERT INTO pedpsy.research_profile_history VALUES(scope.owner_study,scope.owner_participant,revision,v,fields,answers,old.completed_at_ms) ON CONFLICT DO NOTHING;
      END IF;
      fields:=current_fields;v:=current_v;answers:='{}'::jsonb;state:='draft';
    ELSIF state='completed' THEN RAISE EXCEPTION 'PASSPORT_FROZEN' USING ERRCODE='P0001';
    ELSIF action='save' THEN
      IF NOT pedpsy.passport_values_valid(fields,new_answers,false) THEN RAISE EXCEPTION 'INVALID_PASSPORT_VALUES' USING ERRCODE='22023';END IF;
      answers:=new_answers;state:='draft';
    ELSIF action='complete' THEN
      IF NOT pedpsy.passport_values_valid(fields,answers,true) THEN RAISE EXCEPTION 'PASSPORT_INCOMPLETE' USING ERRCODE='P0001';END IF;state:='completed';
    END IF;
    revision:=revision+1;
    INSERT INTO pedpsy.research_profile_drafts VALUES(scope.owner_study,scope.owner_participant,revision,v,fields,answers,state)
      ON CONFLICT(study_id,participant_id) DO UPDATE SET revision=excluded.revision,schema_version=excluded.schema_version,fields=excluded.fields,answers=excluded.answers,status=excluded.status;
    IF action='complete' THEN INSERT INTO pedpsy.research_profile_history VALUES(scope.owner_study,scope.owner_participant,revision,v,fields,answers,floor(extract(epoch FROM clock_timestamp())*1000)::bigint);END IF;
  END IF;
  PERFORM pedpsy.assert_own_passport_session();PERFORM pedpsy.own_passport_audit('participants.passport.'||CASE WHEN action IN ('read','restart') THEN 'read' WHEN action='save' THEN 'save' ELSE 'complete' END,scope.owner_participant,(SELECT count(*)::integer FROM jsonb_object_keys(answers)));
  RETURN jsonb_build_object('study_id',scope.owner_study,'schema_version',v,'revision',revision,'status',state,'fields',fields,'values',answers);
END $$;
CREATE OR REPLACE FUNCTION effective_passport_completed(study uuid,participant uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
  SELECT EXISTS(
    SELECT 1 FROM pedpsy.research_profile_history h
    JOIN pedpsy.participant_group_bindings b ON (b.study_id,b.participant_id)=(h.study_id,h.participant_id)
    WHERE h.study_id=study AND h.participant_id=participant
      AND h.schema_version=(pedpsy.research_schema(study,b.group_id)->>'schema_version')::integer
      AND h.revision=(SELECT max(h2.revision) FROM pedpsy.research_profile_history h2
        WHERE h2.study_id=study AND h2.participant_id=participant)
  ) OR (
    NOT EXISTS(SELECT 1 FROM pedpsy.research_profile_history h WHERE h.study_id=study AND h.participant_id=participant)
    AND EXISTS(
      SELECT 1 FROM pedpsy.participant_passports p
      JOIN pedpsy.study_passport_schemas s ON (s.study_id,s.schema_version)=(p.study_id,p.schema_version)
      JOIN pedpsy.participant_group_bindings b ON (b.study_id,b.participant_id)=(p.study_id,p.participant_id)
      WHERE p.study_id=study AND p.participant_id=participant AND p.status='completed'
        AND s.schema_version=(pedpsy.research_schema(study,b.group_id)->>'schema_version')::integer
    )
  )
$$;
REVOKE ALL ON FUNCTION own_profile(text,integer,integer,jsonb),effective_passport_completed(uuid,uuid) FROM PUBLIC;
