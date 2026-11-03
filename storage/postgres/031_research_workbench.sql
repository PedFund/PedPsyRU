SET LOCAL search_path=pedpsy,pg_catalog;
-- Owner-approved research UX. Contact/status DTOs have no answers or scores.
-- All historical migrations and immutable completed passports are retained.
CREATE TABLE research_group_notes(study_id uuid NOT NULL,group_id uuid NOT NULL,note text NOT NULL CHECK(length(note)<=500 AND note !~ '[[:cntrl:]]'),PRIMARY KEY(study_id,group_id),FOREIGN KEY(study_id,group_id) REFERENCES research_groups(study_id,id));
CREATE TABLE research_stage_notes(study_id uuid NOT NULL,stage_id uuid NOT NULL,note text NOT NULL CHECK(length(note)<=500 AND note !~ '[[:cntrl:]]'),PRIMARY KEY(study_id,stage_id),FOREIGN KEY(study_id,stage_id) REFERENCES research_stages(study_id,id));
CREATE TABLE research_profile_schemas(study_id uuid NOT NULL REFERENCES studies(id),version integer NOT NULL CHECK(version BETWEEN 1 AND 100),fields jsonb NOT NULL CHECK(pedpsy.passport_fields_valid(fields)),PRIMARY KEY(study_id,version));
CREATE TRIGGER research_profile_schema_immutable BEFORE UPDATE OR DELETE ON research_profile_schemas FOR EACH ROW EXECUTE FUNCTION immutable_row();
CREATE TABLE research_profile_defaults(study_id uuid PRIMARY KEY REFERENCES studies(id),version integer NOT NULL,FOREIGN KEY(study_id,version) REFERENCES research_profile_schemas(study_id,version));
CREATE TABLE research_profile_groups(study_id uuid NOT NULL,group_id uuid NOT NULL,version integer NOT NULL,PRIMARY KEY(study_id,group_id),FOREIGN KEY(study_id,group_id) REFERENCES research_groups(study_id,id),FOREIGN KEY(study_id,version) REFERENCES research_profile_schemas(study_id,version));
CREATE TABLE research_profile_drafts(study_id uuid NOT NULL,participant_id uuid NOT NULL,revision integer NOT NULL CHECK(revision BETWEEN 1 AND 2147483646),schema_version integer NOT NULL CHECK(schema_version BETWEEN 1 AND 100),fields jsonb NOT NULL CHECK(pedpsy.passport_fields_valid(fields)),answers jsonb NOT NULL,status text NOT NULL CHECK(status IN ('draft','completed')),PRIMARY KEY(study_id,participant_id),FOREIGN KEY(study_id,participant_id) REFERENCES participant_group_bindings(study_id,participant_id),CHECK(pedpsy.passport_values_valid(fields,answers,status='completed')));
CREATE TABLE research_profile_history(study_id uuid NOT NULL,participant_id uuid NOT NULL,revision integer NOT NULL,schema_version integer NOT NULL,fields jsonb NOT NULL,answers jsonb NOT NULL,completed_at_ms bigint NOT NULL,PRIMARY KEY(study_id,participant_id,revision),FOREIGN KEY(study_id,participant_id) REFERENCES participant_group_bindings(study_id,participant_id),CHECK(pedpsy.passport_fields_valid(fields) AND pedpsy.passport_values_valid(fields,answers,true)));
CREATE TRIGGER research_profile_history_immutable BEFORE UPDATE OR DELETE ON research_profile_history FOR EACH ROW EXECUTE FUNCTION immutable_row();
CREATE UNIQUE INDEX attempt_profile_scope ON attempts(study_id,id);
CREATE TABLE attempt_profile_basis(study_id uuid NOT NULL,attempt_id uuid NOT NULL,participant_id uuid NOT NULL,profile_revision integer NOT NULL,source text NOT NULL CHECK(source IN ('legacy','profile')),fields jsonb NOT NULL,answers jsonb NOT NULL,PRIMARY KEY(study_id,attempt_id),FOREIGN KEY(study_id,attempt_id) REFERENCES attempts(study_id,id),FOREIGN KEY(study_id,participant_id) REFERENCES participants(study_id,id));
CREATE TRIGGER attempt_profile_basis_immutable BEFORE UPDATE OR DELETE ON attempt_profile_basis FOR EACH ROW EXECUTE FUNCTION immutable_row();
CREATE TABLE research_reminder_batches(study_id uuid NOT NULL REFERENCES studies(id),request_id uuid NOT NULL,group_id uuid NOT NULL,stage_id uuid NOT NULL,created_by uuid NOT NULL REFERENCES researcher_credentials(id),created_at_ms bigint NOT NULL,queued integer NOT NULL CHECK(queued BETWEEN 0 AND 500),PRIMARY KEY(study_id,request_id),FOREIGN KEY(study_id,group_id) REFERENCES research_groups(study_id,id),FOREIGN KEY(study_id,stage_id) REFERENCES research_stages(study_id,id));
CREATE TABLE research_reminder_outbox(study_id uuid NOT NULL,request_id uuid NOT NULL,participant_id uuid NOT NULL,stage_id uuid NOT NULL,email text NOT NULL CHECK(email ~ '@example[.]test$'),message text NOT NULL,created_at_ms bigint NOT NULL,PRIMARY KEY(study_id,request_id,participant_id),FOREIGN KEY(study_id,request_id) REFERENCES research_reminder_batches(study_id,request_id),FOREIGN KEY(study_id,participant_id) REFERENCES participants(study_id,id));
CREATE INDEX research_reminder_cooldown ON research_reminder_outbox(study_id,participant_id,stage_id,created_at_ms);
CREATE TRIGGER research_reminder_batch_immutable BEFORE UPDATE OR DELETE ON research_reminder_batches FOR EACH ROW EXECUTE FUNCTION immutable_row();
CREATE TRIGGER research_reminder_outbox_immutable BEFORE UPDATE OR DELETE ON research_reminder_outbox FOR EACH ROW EXECUTE FUNCTION immutable_row();

CREATE FUNCTION lock_research_workbench(study uuid,expected integer DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE a record;
BEGIN
  PERFORM pedpsy.lock_study_design(study,false);SELECT * INTO a FROM pedpsy.account_actor();
  IF a.actor_role IS DISTINCT FROM 'researcher' OR a.expires_at_ms<=floor(extract(epoch FROM clock_timestamp())*1000)::bigint THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE='28000';END IF;
  IF expected IS NOT NULL AND expected<>(SELECT design_version FROM pedpsy.studies WHERE id=study) THEN RAISE EXCEPTION 'DESIGN_CONFLICT' USING ERRCODE='P0001';END IF;
END $$;
CREATE FUNCTION research_schema(study uuid,target_group uuid) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
  SELECT jsonb_build_object('study_id',s.id,'study_version',s.design_version,'schema_version',coalesce(g.version,d.version,p.schema_version),'fields',coalesce(v.fields,b.fields),'frozen',s.status='closed')
  FROM pedpsy.studies s JOIN pedpsy.study_passport_schemas p ON p.study_id=s.id JOIN pedpsy.passport_schema_versions b ON b.study_id=p.study_id AND b.schema_version=p.schema_version
  LEFT JOIN pedpsy.research_profile_defaults d ON d.study_id=s.id LEFT JOIN pedpsy.research_profile_groups g ON g.study_id=s.id AND g.group_id=target_group
  LEFT JOIN pedpsy.research_profile_schemas v ON v.study_id=s.id AND v.version=coalesce(g.version,d.version) WHERE s.id=study
$$;
CREATE FUNCTION research_workbench_snapshot(study uuid) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
 SELECT pedpsy.study_design_snapshot(study)||jsonb_build_object(
  'group_notes',coalesce((SELECT jsonb_object_agg(group_id,note) FROM pedpsy.research_group_notes WHERE study_id=study),'{}'::jsonb),
  'stage_notes',coalesce((SELECT jsonb_object_agg(stage_id,note) FROM pedpsy.research_stage_notes WHERE study_id=study),'{}'::jsonb),
  'profile_schemas',jsonb_build_object('_all',pedpsy.research_schema(study,NULL))||coalesce((SELECT jsonb_object_agg(id,pedpsy.research_schema(study,id)) FROM pedpsy.research_groups WHERE study_id=study),'{}'::jsonb))
$$;
CREATE FUNCTION read_research_workbench(study uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
BEGIN PERFORM pedpsy.lock_research_workbench(study);PERFORM pedpsy.constructor_audit('studies.workbench.read',study);RETURN pedpsy.research_workbench_snapshot(study);END $$;

CREATE FUNCTION research_progress_rows(study uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE data jsonb;count_rows integer;
BEGIN
  SELECT count(*)::integer,coalesce(jsonb_agg(jsonb_build_object('participant_id',q.participant_id,'group_id',q.group_id,'stage_id',q.stage_id,'email',q.email,'status',q.status) ORDER BY q.group_id,q.stage_id,q.participant_id),'[]'::jsonb) INTO count_rows,data
  FROM (SELECT b.participant_id,b.group_id,t.id stage_id,c.email_key email,
    CASE WHEN x.total>0 AND x.finished=x.total THEN 'completed' WHEN x.started>0 THEN 'in_progress' ELSE 'not_started' END status
    FROM pedpsy.participant_group_bindings b JOIN pedpsy.participants p ON (p.study_id,p.id)=(b.study_id,b.participant_id) AND p.status='active'
    JOIN pedpsy.research_groups g ON (g.study_id,g.id)=(b.study_id,b.group_id) AND g.status='active'
    JOIN pedpsy.participant_contacts c ON (c.study_id,c.participant_id)=(b.study_id,b.participant_id) AND c.status='active'
    JOIN pedpsy.research_stages t ON t.study_id=b.study_id AND t.status='active'
    CROSS JOIN LATERAL (SELECT count(*) total,count(*) FILTER(WHERE a.status='completed') finished,count(*) FILTER(WHERE a.status='completed' OR EXISTS(SELECT 1 FROM pedpsy.responses r WHERE r.study_id=a.study_id AND r.attempt_id=a.id)) started
      FROM pedpsy.assignments z LEFT JOIN pedpsy.attempts a ON a.study_id=z.study_id AND a.assignment_id=z.id AND a.enrollment_id IN (SELECT en.id FROM pedpsy.stage_enrollments en WHERE en.study_id=b.study_id AND en.participant_id=b.participant_id)
      LEFT JOIN pedpsy.stage_enrollments e ON (e.study_id,e.id)=(a.study_id,a.enrollment_id)
      WHERE z.study_id=b.study_id AND z.group_id=b.group_id AND z.stage_id=t.id AND z.status='active' AND (e.id IS NULL OR e.status='active')) x
    WHERE b.study_id=study AND c.email_key ~ '@example[.]test$' ORDER BY b.participant_id,t.id LIMIT 501) q;
  IF count_rows>500 OR octet_length(data::text)>1048576 THEN RAISE EXCEPTION 'EXPORT_LIMIT' USING ERRCODE='54000';END IF;
  RETURN data;
END $$;
CREATE FUNCTION research_progress(study uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE data jsonb;
BEGIN
  PERFORM pedpsy.lock_research_workbench(study);data:=pedpsy.research_progress_rows(study);
  PERFORM pedpsy.constructor_audit('studies.progress.read',study);
  RETURN jsonb_build_object('rows',data,'reminders',coalesce((SELECT jsonb_agg(jsonb_build_object('participant_id',r.participant_id,'stage_id',r.stage_id,'created_at',r.created_at_ms)) FROM (SELECT participant_id,stage_id,max(created_at_ms) created_at_ms FROM pedpsy.research_reminder_outbox WHERE study_id=study GROUP BY participant_id,stage_id) r),'[]'::jsonb));
END $$;
CREATE FUNCTION change_research_workbench(study uuid,expected integer,action text,input jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE target uuid;new_version integer;g record;t record;v integer;releases uuid[];fields jsonb;schema_snapshot jsonb;groups uuid[];at_ms bigint;rows jsonb;r jsonb;n integer:=0;actor record;request uuid;
BEGIN
  PERFORM pedpsy.lock_research_workbench(study,expected);
  IF input IS NULL OR jsonb_typeof(input)<>'object' OR action NOT IN ('initialize','group','stage','assign','schema','remind') THEN RAISE EXCEPTION 'INVALID_STUDY_INPUT' USING ERRCODE='22023';END IF;
  IF action IN ('initialize','group','stage','assign') THEN PERFORM pedpsy.require_mutable_design(study,expected);END IF;
  IF action='initialize' THEN
    IF NOT EXISTS(SELECT 1 FROM pedpsy.research_groups WHERE study_id=study) THEN PERFORM pedpsy.configure_study_group(study,expected,gen_random_uuid(),'Экспериментальная','experimental',true);END IF;
  ELSIF action='group' THEN
    target:=coalesce((input->>'id')::uuid,gen_random_uuid());
    PERFORM pedpsy.configure_study_group(study,expected,target,input->>'name',input->>'kind',input->>'id' IS NULL);
    INSERT INTO pedpsy.research_group_notes VALUES(study,target,input->>'note') ON CONFLICT(study_id,group_id) DO UPDATE SET note=excluded.note;
  ELSIF action='stage' THEN
    IF input->>'code' NOT IN ('T0','T1','T2') THEN RAISE EXCEPTION 'INVALID_STUDY_INPUT' USING ERRCODE='22023';END IF;
    target:=coalesce((input->>'id')::uuid,gen_random_uuid());
    PERFORM pedpsy.configure_study_stage(study,expected,target,input->>'code',substring(input->>'code' FROM 2)::integer,input->>'id' IS NULL);
    INSERT INTO pedpsy.research_stage_notes VALUES(study,target,input->>'note') ON CONFLICT(study_id,stage_id) DO UPDATE SET note=excluded.note;
  ELSIF action='assign' THEN
    SELECT coalesce(array_agg(value::uuid),ARRAY[]::uuid[]) INTO releases FROM jsonb_array_elements_text(input->'release_ids');v:=expected;
    IF (input->>'all')::boolean THEN
      IF NOT EXISTS(SELECT 1 FROM pedpsy.research_stages WHERE study_id=study AND status='active') THEN RAISE EXCEPTION 'DESIGN_INCOMPLETE' USING ERRCODE='P0001';END IF;
      FOR g IN SELECT id FROM pedpsy.research_groups WHERE study_id=study AND status='active' ORDER BY id LOOP
        FOR t IN SELECT id FROM pedpsy.research_stages WHERE study_id=study AND status='active' ORDER BY id LOOP
          PERFORM pedpsy.configure_study_assignments(study,v,g.id,t.id,releases);v:=v+1;
        END LOOP;
      END LOOP;
    ELSE PERFORM pedpsy.configure_study_assignments(study,v,(input->>'group_id')::uuid,(input->>'stage_id')::uuid,releases);END IF;
  ELSIF action='schema' THEN
    IF (SELECT status FROM pedpsy.studies WHERE id=study)='closed' THEN RAISE EXCEPTION 'DESIGN_FROZEN' USING ERRCODE='P0001';END IF;
    IF jsonb_typeof(input->'all')<>'boolean' OR jsonb_typeof(input->'city_required')<>'boolean' OR NOT pedpsy.passport_additional_valid(input->'fields') THEN RAISE EXCEPTION 'INVALID_PASSPORT_SCHEMA' USING ERRCODE='22023';END IF;
    target:=(input->>'group_id')::uuid;
    IF NOT (input->>'all')::boolean AND NOT EXISTS(SELECT 1 FROM pedpsy.research_groups WHERE study_id=study AND id=target) THEN RAISE EXCEPTION 'NOT_AVAILABLE' USING ERRCODE='P0002';END IF;
    schema_snapshot:=pedpsy.research_schema(study,target);
    IF (input->>'schema_version')::integer IS DISTINCT FROM (schema_snapshot->>'schema_version')::integer THEN RAISE EXCEPTION 'PASSPORT_SCHEMA_CONFLICT' USING ERRCODE='P0001';END IF;
    SELECT greatest(coalesce(max(version),0),coalesce((SELECT max(schema_version) FROM pedpsy.passport_schema_versions WHERE study_id=study),0))+1 INTO new_version FROM pedpsy.research_profile_schemas WHERE study_id=study;
    IF new_version>100 THEN RAISE EXCEPTION 'DESIGN_LIMIT' USING ERRCODE='54000';END IF;
    fields:=pedpsy.passport_basic_fields((input->>'city_required')::boolean)||(input->'fields');
    INSERT INTO pedpsy.research_profile_schemas VALUES(study,new_version,fields);
    IF (input->>'all')::boolean THEN
      INSERT INTO pedpsy.research_profile_defaults VALUES(study,new_version) ON CONFLICT(study_id) DO UPDATE SET version=excluded.version;
      DELETE FROM pedpsy.research_profile_groups WHERE study_id=study;
    ELSE INSERT INTO pedpsy.research_profile_groups VALUES(study,target,new_version) ON CONFLICT(study_id,group_id) DO UPDATE SET version=excluded.version;END IF;
    PERFORM pedpsy.finish_study_design(study,'studies.profile_schema.configure');
  ELSIF action='remind' THEN
    IF (SELECT status FROM pedpsy.studies WHERE id=study)<>'active' THEN RAISE EXCEPTION 'DESIGN_FROZEN' USING ERRCODE='P0001';END IF;
    target:=(input->>'group_id')::uuid;request:=(input->>'request_id')::uuid;
    IF NOT EXISTS(SELECT 1 FROM pedpsy.research_groups WHERE study_id=study AND id=target AND status='active') OR NOT EXISTS(SELECT 1 FROM pedpsy.research_stages WHERE study_id=study AND id=(input->>'stage_id')::uuid AND status='active') THEN RAISE EXCEPTION 'NOT_AVAILABLE' USING ERRCODE='P0002';END IF;
    IF EXISTS(SELECT 1 FROM pedpsy.research_reminder_batches WHERE study_id=study AND request_id=request AND (group_id<>target OR stage_id<>(input->>'stage_id')::uuid)) THEN RAISE EXCEPTION 'INVALID_STUDY_INPUT' USING ERRCODE='22023';END IF;
    IF EXISTS(SELECT 1 FROM pedpsy.research_reminder_batches WHERE study_id=study AND request_id=request) THEN RETURN jsonb_build_object('queued',(SELECT queued FROM pedpsy.research_reminder_batches WHERE study_id=study AND request_id=request),'mode','synthetic');END IF;
    at_ms:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
    IF (SELECT count(*) FROM pedpsy.research_reminder_batches WHERE study_id=study AND created_at_ms>at_ms-3600000)>=10 THEN RAISE EXCEPTION 'INVITE_THROTTLED' USING ERRCODE='54000';END IF;
    -- Admission creation/completion uses participant identity locks; lock before
    -- regenerating status, so a queued reminder cannot race a completed result.
    PERFORM 1 FROM pedpsy.participant_credentials WHERE study_id=study ORDER BY id FOR UPDATE;
    rows:=pedpsy.research_progress_rows(study);SELECT * INTO actor FROM pedpsy.account_actor();
    SELECT count(*)::integer INTO n FROM jsonb_array_elements(rows) x WHERE (x->>'group_id')::uuid=target AND (x->>'stage_id')::uuid=(input->>'stage_id')::uuid AND x->>'status'<>'completed'
      AND NOT EXISTS(SELECT 1 FROM pedpsy.research_reminder_outbox o WHERE o.study_id=study AND o.participant_id=(x->>'participant_id')::uuid AND o.stage_id=(x->>'stage_id')::uuid AND o.created_at_ms>at_ms-86400000);
    INSERT INTO pedpsy.research_reminder_batches VALUES(study,request,target,(input->>'stage_id')::uuid,actor.credential_id,at_ms,n);
    INSERT INTO pedpsy.research_reminder_outbox SELECT study,request,(x->>'participant_id')::uuid,(x->>'stage_id')::uuid,x->>'email','Пожалуйста, завершите прохождение этапа исследования. Если вы уже завершили его, повторное заполнение не требуется.',at_ms
      FROM jsonb_array_elements(rows) x WHERE (x->>'group_id')::uuid=target AND (x->>'stage_id')::uuid=(input->>'stage_id')::uuid AND x->>'status'<>'completed'
      AND NOT EXISTS(SELECT 1 FROM pedpsy.research_reminder_outbox o WHERE o.study_id=study AND o.participant_id=(x->>'participant_id')::uuid AND o.stage_id=(x->>'stage_id')::uuid AND o.created_at_ms>at_ms-86400000);
    PERFORM pedpsy.constructor_audit('studies.reminders.synthetic',study);RETURN jsonb_build_object('queued',n,'mode','synthetic');
  END IF;
  PERFORM pedpsy.constructor_audit('studies.workbench.configure',study);RETURN pedpsy.research_workbench_snapshot(study);
END $$;
CREATE FUNCTION own_profile(action text,target_schema integer,expected_revision integer,new_answers jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE scope record;binding record;p record;old record;schema jsonb;fields jsonb;answers jsonb;revision integer;state text;v integer;
BEGIN
  SELECT * INTO scope FROM pedpsy.lock_own_passport_scope();
  SELECT * INTO binding FROM pedpsy.participant_group_bindings WHERE study_id=scope.owner_study AND participant_id=scope.owner_participant;
  SELECT * INTO p FROM pedpsy.research_profile_drafts WHERE study_id=scope.owner_study AND participant_id=scope.owner_participant FOR UPDATE;
  SELECT * INTO old FROM pedpsy.participant_passports WHERE study_id=scope.owner_study AND participant_id=scope.owner_participant FOR SHARE;
  schema:=pedpsy.research_schema(scope.owner_study,binding.group_id);fields:=schema->'fields';v:=(schema->>'schema_version')::integer;
  revision:=coalesce(p.revision,old.revision,0);state:=coalesce(p.status,old.status,'not_started');answers:=coalesce(p.answers,old.answers,'{}'::jsonb);
  IF p.revision IS NOT NULL THEN fields:=p.fields;v:=p.schema_version;
  ELSIF old.revision IS NOT NULL THEN SELECT f.fields INTO fields FROM pedpsy.passport_schema_versions f WHERE f.study_id=scope.owner_study AND f.schema_version=old.schema_version;v:=old.schema_version;END IF;
  IF action NOT IN ('read','restart','save','complete') OR action IS NULL THEN RAISE EXCEPTION 'INVALID_PASSPORT_VALUES' USING ERRCODE='22023';END IF;
  IF action<>'read' THEN
    IF expected_revision IS DISTINCT FROM revision THEN RAISE EXCEPTION 'PASSPORT_CONFLICT' USING ERRCODE='P0001';END IF;
    IF target_schema IS DISTINCT FROM v THEN RAISE EXCEPTION 'PARTICIPATION_REQUIREMENTS_CHANGED' USING ERRCODE='P0001';END IF;
    IF revision>=2147483645 THEN RAISE EXCEPTION 'PASSPORT_LIMIT' USING ERRCODE='54000';END IF;
    IF action='restart' THEN
      IF state<>'completed' THEN RAISE EXCEPTION 'PASSPORT_CONFLICT' USING ERRCODE='P0001';END IF;
      -- Preserve legacy completion before explicit, voluntary replacement.
      IF p.revision IS NULL THEN INSERT INTO pedpsy.research_profile_history VALUES(scope.owner_study,scope.owner_participant,revision,v,fields,answers,old.completed_at_ms) ON CONFLICT DO NOTHING;END IF;
      fields:=schema->'fields';v:=(schema->>'schema_version')::integer;answers:='{}'::jsonb;state:='draft';
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
CREATE FUNCTION effective_passport_completed(study uuid,participant uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM pedpsy.research_profile_history WHERE study_id=study AND participant_id=participant)
 OR EXISTS(SELECT 1 FROM pedpsy.participant_passports p JOIN pedpsy.study_passport_schemas s ON s.study_id=p.study_id AND s.schema_version=p.schema_version WHERE p.study_id=study AND p.participant_id=participant AND p.status='completed')
$$;
CREATE FUNCTION capture_attempt_profile() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE p record;target_participant uuid;
BEGIN
  SELECT participant_id INTO target_participant FROM pedpsy.stage_enrollments WHERE study_id=NEW.study_id AND id=NEW.enrollment_id;
  SELECT * INTO p FROM pedpsy.research_profile_history WHERE study_id=NEW.study_id AND participant_id=target_participant ORDER BY revision DESC LIMIT 1;
  IF FOUND THEN INSERT INTO pedpsy.attempt_profile_basis VALUES(NEW.study_id,NEW.id,target_participant,p.revision,'profile',p.fields,p.answers);
  ELSE INSERT INTO pedpsy.attempt_profile_basis SELECT NEW.study_id,NEW.id,target_participant,l.revision,'legacy',s.fields,l.answers FROM pedpsy.participant_passports l JOIN pedpsy.passport_schema_versions s ON s.study_id=l.study_id AND s.schema_version=l.schema_version WHERE l.study_id=NEW.study_id AND l.participant_id=target_participant AND l.status='completed';END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER capture_attempt_profile AFTER INSERT ON attempts FOR EACH ROW EXECUTE FUNCTION capture_attempt_profile();

-- New tables are private, no direct runtime SELECT/INSERT/UPDATE or helpers.
ALTER TABLE research_group_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE research_stage_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE research_profile_schemas ENABLE ROW LEVEL SECURITY;
ALTER TABLE research_profile_defaults ENABLE ROW LEVEL SECURITY;
ALTER TABLE research_profile_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE research_profile_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE research_profile_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE attempt_profile_basis ENABLE ROW LEVEL SECURITY;
ALTER TABLE research_reminder_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE research_reminder_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON research_group_notes,research_stage_notes,research_profile_schemas,research_profile_defaults,research_profile_groups,research_profile_drafts,research_profile_history,attempt_profile_basis,research_reminder_batches,research_reminder_outbox FROM PUBLIC;
REVOKE ALL ON FUNCTION lock_research_workbench(uuid,integer),research_schema(uuid,uuid),research_workbench_snapshot(uuid),read_research_workbench(uuid),research_progress_rows(uuid),research_progress(uuid),change_research_workbench(uuid,integer,text,jsonb),own_profile(text,integer,integer,jsonb),effective_passport_completed(uuid,uuid),capture_attempt_profile() FROM PUBLIC;

CREATE OR REPLACE FUNCTION read_own_stages() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE scope record;binding record;pointer record;passport record;actor record;
  stage record;opening record;enrollment record;assignment record;
  data jsonb:='[]'::jsonb;ids jsonb;stages_count integer:=0;assignments_count integer;
  valid_assignments boolean;completed boolean;consented boolean;
BEGIN
  -- Existing scope locks identity/group/contact/current schema/policy/docs.
  SELECT * INTO scope FROM pedpsy.lock_own_consent_scope();
  SELECT * INTO binding FROM pedpsy.participant_group_bindings
    WHERE study_id=scope.owner_study AND participant_id=scope.owner_participant;
  SELECT * INTO pointer FROM pedpsy.study_passport_schemas WHERE study_id=scope.owner_study;
  SELECT * INTO passport FROM pedpsy.participant_passports
    WHERE study_id=scope.owner_study AND participant_id=scope.owner_participant FOR SHARE;
  PERFORM 1 FROM pedpsy.participant_consent_acceptances
    WHERE study_id=scope.owner_study AND participant_id=scope.owner_participant
    ORDER BY purpose,document_version FOR SHARE;
  PERFORM pedpsy.assert_own_passport_session();
  IF passport.schema_version IS NOT NULL AND passport.schema_version<>pointer.schema_version THEN
    RAISE EXCEPTION 'PARTICIPATION_REQUIREMENTS_CHANGED' USING ERRCODE='P0001';
  END IF;
  completed:=pedpsy.effective_passport_completed(scope.owner_study,scope.owner_participant);
  consented:=EXISTS(SELECT 1 FROM pedpsy.participant_consent_acceptances
    WHERE study_id=scope.owner_study AND participant_id=scope.owner_participant
      AND purpose='study_participation' AND document_version=scope.participation_version);
  -- Current contact acceptance is independently required by locked scope027.
  FOR stage IN SELECT * FROM pedpsy.research_stages WHERE study_id=scope.owner_study
    ORDER BY id FOR SHARE LOOP
    stages_count:=stages_count+1;
    IF stages_count>50 THEN RAISE EXCEPTION 'DESIGN_LIMIT' USING ERRCODE='54000';END IF;
    SELECT * INTO opening FROM pedpsy.group_stage_access
      WHERE study_id=scope.owner_study AND group_id=binding.group_id AND stage_id=stage.id FOR SHARE;
    SELECT * INTO enrollment FROM pedpsy.stage_enrollments
      WHERE study_id=scope.owner_study AND participant_id=scope.owner_participant AND stage_id=stage.id FOR SHARE;
    ids:='[]'::jsonb;assignments_count:=0;valid_assignments:=true;
    FOR assignment IN SELECT * FROM pedpsy.assignments
      WHERE study_id=scope.owner_study AND group_id=binding.group_id AND stage_id=stage.id
      ORDER BY id FOR SHARE LOOP
      assignments_count:=assignments_count+1;
      IF assignments_count>10 THEN RAISE EXCEPTION 'DESIGN_LIMIT' USING ERRCODE='54000';END IF;
      IF assignment.status='active' THEN
        PERFORM 1 FROM pedpsy.instrument_releases WHERE id=assignment.release_id FOR SHARE;
        IF NOT pedpsy.constructor_release_allowed(assignment.release_id) THEN valid_assignments:=false;END IF;
        ids:=ids||jsonb_build_array(assignment.id);
      END IF;
    END LOOP;
    PERFORM pedpsy.assert_own_passport_session();
    IF stage.status='active' AND opening.id IS NOT NULL AND valid_assignments AND jsonb_array_length(ids)>0
      AND (enrollment.id IS NULL OR (enrollment.status='active' AND enrollment.group_id=binding.group_id)) THEN
      data:=data||jsonb_build_array(jsonb_build_object('stage_id',stage.id,'code',stage.code,
        'ordinal',stage.ordinal,'opening_revision',opening.revision,'assignment_ids',ids));
    END IF;
  END LOOP;
  SELECT coalesce(jsonb_agg(value ORDER BY (value->>'ordinal')::integer,value->>'stage_id'),'[]'::jsonb)
    INTO data FROM jsonb_array_elements(data);
  PERFORM pedpsy.assert_own_passport_session();SELECT * INTO actor FROM pedpsy.session_actor() WHERE actor_role='participant';
  INSERT INTO pedpsy.access_audit_events(id,at_ms,credential_id,study_id,action,outcome,reason,resource_id,record_count)
    VALUES(gen_random_uuid(),floor(extract(epoch FROM clock_timestamp())*1000)::bigint,actor.credential_id,scope.owner_study,
      'participants.stages.read','allow','OWN_SCOPE',scope.owner_participant,jsonb_array_length(data));
  PERFORM pedpsy.assert_own_passport_session();PERFORM pedpsy.touch_session();
  RETURN jsonb_build_object('study_id',scope.owner_study,'group_id',binding.group_id,
    'passport_schema_version',pointer.schema_version,'passport_completed',completed,
    'required_consents_accepted',consented,'stages',data);
END $$;

CREATE OR REPLACE FUNCTION lock_own_stage_requirements(target_stage uuid)
RETURNS TABLE(owner_study uuid,owner_participant uuid,owner_group uuid,passport_version integer,policy_revision integer,participation_version text,contact_version text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pedpsy,pg_temp AS $$
DECLARE scope record;binding record;pointer record;passport record;stage record;opening record;enrollment record;assignment record;assignment_count integer:=0;contact_policy record;
BEGIN
  SELECT * INTO scope FROM pedpsy.lock_own_consent_scope();
  SELECT * INTO binding FROM pedpsy.participant_group_bindings WHERE study_id=scope.owner_study AND participant_id=scope.owner_participant;
  SELECT * INTO pointer FROM pedpsy.study_passport_schemas WHERE study_id=scope.owner_study;
  SELECT * INTO passport FROM pedpsy.participant_passports WHERE study_id=scope.owner_study AND participant_id=scope.owner_participant FOR SHARE;
  PERFORM 1 FROM pedpsy.participant_consent_acceptances WHERE study_id=scope.owner_study AND participant_id=scope.owner_participant ORDER BY purpose,document_version FOR SHARE;
  PERFORM pedpsy.assert_own_passport_session();
  IF NOT pedpsy.effective_passport_completed(scope.owner_study,scope.owner_participant) OR NOT EXISTS(
    SELECT 1 FROM pedpsy.participant_consent_acceptances a WHERE a.study_id=scope.owner_study AND a.participant_id=scope.owner_participant
      AND a.purpose='study_participation' AND a.document_version=scope.participation_version) THEN
    RAISE EXCEPTION 'PARTICIPATION_REQUIREMENTS_CHANGED' USING ERRCODE='P0001';
  END IF;
  SELECT * INTO stage FROM pedpsy.research_stages WHERE study_id=scope.owner_study AND id=target_stage FOR SHARE;
  SELECT * INTO opening FROM pedpsy.group_stage_access WHERE study_id=scope.owner_study AND group_id=binding.group_id AND stage_id=target_stage FOR SHARE;
  SELECT * INTO enrollment FROM pedpsy.stage_enrollments WHERE study_id=scope.owner_study AND participant_id=scope.owner_participant AND stage_id=target_stage FOR SHARE;
  IF stage.id IS NULL OR stage.status<>'active' OR opening.id IS NULL OR opening.revision<>1
    OR (enrollment.id IS NOT NULL AND (enrollment.status<>'active' OR enrollment.group_id<>binding.group_id)) THEN
    RAISE EXCEPTION 'NOT_AVAILABLE' USING ERRCODE='P0002';
  END IF;
  FOR assignment IN SELECT * FROM pedpsy.assignments WHERE study_id=scope.owner_study AND group_id=binding.group_id AND stage_id=target_stage ORDER BY id FOR SHARE LOOP
    IF assignment.status='active' THEN
      assignment_count:=assignment_count+1;IF assignment_count>10 THEN RAISE EXCEPTION 'DESIGN_LIMIT' USING ERRCODE='54000';END IF;
      PERFORM 1 FROM pedpsy.instrument_releases WHERE id=assignment.release_id FOR SHARE;
      IF NOT pedpsy.constructor_release_allowed(assignment.release_id) THEN RAISE EXCEPTION 'NOT_AVAILABLE' USING ERRCODE='P0002';END IF;
    END IF;
  END LOOP;
  PERFORM pedpsy.assert_own_passport_session();
  IF assignment_count=0 THEN RAISE EXCEPTION 'NOT_AVAILABLE' USING ERRCODE='P0002';END IF;
  SELECT * INTO contact_policy FROM pedpsy.study_contact_policies WHERE study_id=scope.owner_study;
  RETURN QUERY SELECT scope.owner_study,scope.owner_participant,binding.group_id,pointer.schema_version,scope.policy_revision,scope.participation_version,contact_policy.notice_version;
END $$;

