-- Synthetic contour only; independent of unchanged SQLite migration history.
CREATE SCHEMA pedpsy;
REVOKE ALL ON SCHEMA pedpsy FROM PUBLIC;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
SET LOCAL search_path = pedpsy, pg_catalog;
CREATE TABLE users (
  id uuid PRIMARY KEY, status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','disabled')),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE studies (
  id uuid PRIMARY KEY, title text NOT NULL CHECK(length(trim(title))>0),
  status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','active','closed')),
  dataset_kind text NOT NULL DEFAULT 'demo' CHECK(dataset_kind='demo'),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE study_memberships (
  study_id uuid NOT NULL REFERENCES studies(id), user_id uuid NOT NULL REFERENCES users(id),
  role text NOT NULL CHECK(role IN ('researcher','administrator')), status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','revoked')),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(study_id,user_id,role)
);
CREATE TABLE research_groups (
  id uuid PRIMARY KEY, study_id uuid NOT NULL REFERENCES studies(id), name text NOT NULL CHECK(length(trim(name))>0),
  kind text NOT NULL CHECK(kind IN ('control','experimental','other')), status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','closed')),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(study_id,id)
);
CREATE TABLE research_stages (
  id uuid PRIMARY KEY, study_id uuid NOT NULL REFERENCES studies(id), code text NOT NULL CHECK(length(trim(code))>0),
  ordinal integer NOT NULL CHECK(ordinal>=0), status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','closed')), based_on_stage_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK(based_on_stage_id IS NULL OR based_on_stage_id<>id), UNIQUE(study_id,id), UNIQUE(study_id,code), UNIQUE(study_id,ordinal),
  FOREIGN KEY(study_id,based_on_stage_id) REFERENCES research_stages(study_id,id)
);
CREATE TABLE instrument_releases (
  id uuid PRIMARY KEY, method_id text NOT NULL CHECK(method_id='tki_ru_30_pairs'), form_id text NOT NULL, form_version text NOT NULL,
  method_version_id text NOT NULL CHECK(method_version_id='tki_ru_30_pairs@1.0.0'), handler_version text NOT NULL CHECK(handler_version='tki-contract-0.3.0'),
  contract_version text NOT NULL CHECK(contract_version='1.0'), form_digest text NOT NULL CHECK(form_digest ~ '^sha256:[a-f0-9]{64}$'),
  key_digest text NOT NULL CHECK(key_digest='sha256:45bc0c8a1b3f154fb3da5df629da6c42613609633594c4f5f54014a301cded7d'),
  verification_state text NOT NULL CHECK(verification_state='key_verified'), publication_state text NOT NULL CHECK(publication_state='draft'),
  artifact_ref text NOT NULL, form_snapshot jsonb NOT NULL CHECK(jsonb_typeof(form_snapshot)='object'), created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(form_id,form_version,method_version_id,handler_version,contract_version)
);
CREATE TABLE release_items (
  release_id uuid NOT NULL REFERENCES instrument_releases(id), item_id text NOT NULL, ordinal integer NOT NULL CHECK(ordinal BETWEEN 1 AND 30), options jsonb NOT NULL,
  CHECK(item_id='q'||lpad(ordinal::text,2,'0')),
  CHECK(COALESCE(jsonb_typeof(options)='array' AND jsonb_array_length(options)=2 AND options->0->>'value'='A' AND options->1->>'value'='B'
    AND jsonb_typeof(options->0->'text')='string' AND jsonb_typeof(options->1->'text')='string',false)),
  PRIMARY KEY(release_id,item_id), UNIQUE(release_id,ordinal)
);
CREATE TABLE assignments (
  id uuid PRIMARY KEY, study_id uuid NOT NULL REFERENCES studies(id), group_id uuid NOT NULL, stage_id uuid NOT NULL,
  release_id uuid NOT NULL REFERENCES instrument_releases(id), status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','closed')),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(study_id,group_id,stage_id,release_id), UNIQUE(study_id,id,group_id,stage_id,release_id),
  FOREIGN KEY(study_id,group_id) REFERENCES research_groups(study_id,id), FOREIGN KEY(study_id,stage_id) REFERENCES research_stages(study_id,id)
);
CREATE TABLE participants (
  id uuid PRIMARY KEY, study_id uuid NOT NULL REFERENCES studies(id), display_code text NOT NULL CHECK(length(trim(display_code))>0),
  status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','excluded')),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(study_id,id), UNIQUE(study_id,display_code)
);
CREATE TABLE stage_enrollments (
  id uuid PRIMARY KEY, study_id uuid NOT NULL REFERENCES studies(id), participant_id uuid NOT NULL, group_id uuid NOT NULL, stage_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','excluded')), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(study_id,participant_id,stage_id), UNIQUE(study_id,id,group_id,stage_id),
  FOREIGN KEY(study_id,participant_id) REFERENCES participants(study_id,id), FOREIGN KEY(study_id,group_id) REFERENCES research_groups(study_id,id),
  FOREIGN KEY(study_id,stage_id) REFERENCES research_stages(study_id,id)
);
CREATE TABLE attempts (
  id uuid PRIMARY KEY, study_id uuid NOT NULL REFERENCES studies(id), enrollment_id uuid NOT NULL, assignment_id uuid NOT NULL,
  group_id uuid NOT NULL, stage_id uuid NOT NULL, release_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','completed')), revision bigint NOT NULL DEFAULT 0 CHECK(revision BETWEEN 0 AND 9007199254740991), current_item_id text NOT NULL,
  completion_result_id uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz,
  CHECK((status='draft' AND completed_at IS NULL AND completion_result_id IS NULL) OR (status='completed' AND completed_at IS NOT NULL AND completion_result_id IS NOT NULL)),
  UNIQUE(study_id,enrollment_id,assignment_id), UNIQUE(study_id,id,release_id), UNIQUE(study_id,id,release_id,status),
  FOREIGN KEY(study_id,enrollment_id,group_id,stage_id) REFERENCES stage_enrollments(study_id,id,group_id,stage_id),
  FOREIGN KEY(study_id,assignment_id,group_id,stage_id,release_id) REFERENCES assignments(study_id,id,group_id,stage_id,release_id),
  FOREIGN KEY(release_id,current_item_id) REFERENCES release_items(release_id,item_id)
);
CREATE TABLE responses (
  study_id uuid NOT NULL, attempt_id uuid NOT NULL, release_id uuid NOT NULL, item_id text NOT NULL, value text NOT NULL CHECK(value IN ('A','B')),
  updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(attempt_id,item_id),
  FOREIGN KEY(study_id,attempt_id,release_id) REFERENCES attempts(study_id,id,release_id), FOREIGN KEY(release_id,item_id) REFERENCES release_items(release_id,item_id)
);
CREATE TABLE attempt_results (
  id uuid PRIMARY KEY, study_id uuid NOT NULL, attempt_id uuid NOT NULL UNIQUE, release_id uuid NOT NULL,
  attempt_status text NOT NULL DEFAULT 'completed' CHECK(attempt_status='completed'), input_revision bigint NOT NULL CHECK(input_revision BETWEEN 0 AND 9007199254740991),
  responses_digest text NOT NULL CHECK(responses_digest ~ '^sha256:[a-f0-9]{64}$'), contract_version text NOT NULL CHECK(contract_version='1.0'),
  handler_version text NOT NULL CHECK(handler_version='tki-contract-0.3.0'),
  key_digest text NOT NULL CHECK(key_digest='sha256:45bc0c8a1b3f154fb3da5df629da6c42613609633594c4f5f54014a301cded7d'),
  calculated_at timestamptz NOT NULL DEFAULT now(), payload jsonb NOT NULL,
  CHECK(COALESCE(payload->>'status'='scored' AND payload->>'method_version_id'='tki_ru_30_pairs@1.0.0' AND payload->>'contract_version'=contract_version
    AND payload->>'handler_version'=handler_version AND payload->'calculation'->>'key_digest'=key_digest,false)),
  UNIQUE(study_id,id,attempt_id,release_id),
  FOREIGN KEY(study_id,attempt_id,release_id,attempt_status) REFERENCES attempts(study_id,id,release_id,status) DEFERRABLE INITIALLY DEFERRED
);
ALTER TABLE attempts ADD FOREIGN KEY(study_id,completion_result_id,id,release_id) REFERENCES attempt_results(study_id,id,attempt_id,release_id) DEFERRABLE INITIALLY DEFERRED;
CREATE TABLE seed_runs (name text PRIMARY KEY, source_digest text NOT NULL, manifest jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now());

-- Indexes cover the leftmost scoped FK columns and frequently accessed parents.
CREATE INDEX memberships_user ON study_memberships(user_id);
CREATE INDEX stages_parent ON research_stages(study_id,based_on_stage_id);
CREATE INDEX assignments_stage ON assignments(study_id,stage_id);
CREATE INDEX assignments_release ON assignments(release_id);
CREATE INDEX enrollments_group ON stage_enrollments(study_id,group_id);
CREATE INDEX enrollments_stage ON stage_enrollments(study_id,stage_id);
CREATE INDEX attempts_enrollment ON attempts(study_id,enrollment_id,group_id,stage_id);
CREATE INDEX attempts_assignment ON attempts(study_id,assignment_id,group_id,stage_id,release_id);
CREATE INDEX attempts_result ON attempts(study_id,completion_result_id,id,release_id);
CREATE INDEX attempts_item ON attempts(release_id,current_item_id);
CREATE INDEX responses_scope ON responses(study_id,attempt_id,release_id);
CREATE INDEX responses_item ON responses(release_id,item_id);
CREATE INDEX results_attempt_scope ON attempt_results(study_id,attempt_id,release_id,attempt_status);

CREATE FUNCTION immutable_row() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,pedpsy AS $$
BEGIN RAISE EXCEPTION 'immutable row' USING ERRCODE='23514'; END $$;
CREATE TRIGGER release_immutable BEFORE UPDATE OR DELETE ON instrument_releases FOR EACH ROW EXECUTE FUNCTION immutable_row();
CREATE TRIGGER result_immutable BEFORE UPDATE OR DELETE ON attempt_results FOR EACH ROW EXECUTE FUNCTION immutable_row();
CREATE FUNCTION guard_items() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,pedpsy AS $$
DECLARE release uuid;
BEGIN
  release := CASE WHEN TG_OP='DELETE' THEN OLD.release_id ELSE NEW.release_id END;
  IF EXISTS(SELECT 1 FROM pedpsy.assignments WHERE release_id=release) THEN RAISE EXCEPTION 'assigned release is frozen' USING ERRCODE='23514'; END IF;
  IF TG_OP='UPDATE' AND EXISTS(SELECT 1 FROM pedpsy.assignments WHERE release_id=OLD.release_id) THEN RAISE EXCEPTION 'assigned release is frozen' USING ERRCODE='23514'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
CREATE TRIGGER items_frozen BEFORE INSERT OR UPDATE OR DELETE ON release_items FOR EACH ROW EXECUTE FUNCTION guard_items();
CREATE FUNCTION guard_assignment() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,pedpsy AS $$
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') AND EXISTS(SELECT 1 FROM pedpsy.attempts WHERE assignment_id=OLD.id) THEN
    IF TG_OP='DELETE' OR (NEW.id,NEW.study_id,NEW.group_id,NEW.stage_id,NEW.release_id) IS DISTINCT FROM (OLD.id,OLD.study_id,OLD.group_id,OLD.stage_id,OLD.release_id)
      THEN RAISE EXCEPTION 'assignment scope is frozen' USING ERRCODE='23514'; END IF;
  END IF;
  IF TG_OP<>'DELETE' AND (SELECT count(*) FROM pedpsy.release_items WHERE release_id=NEW.release_id)<>30 THEN RAISE EXCEPTION 'release requires 30 items' USING ERRCODE='23514'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
CREATE TRIGGER assignment_frozen BEFORE INSERT OR UPDATE OR DELETE ON assignments FOR EACH ROW EXECUTE FUNCTION guard_assignment();
CREATE FUNCTION guard_enrollment() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,pedpsy AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM pedpsy.attempts WHERE enrollment_id=OLD.id) AND
    (TG_OP='DELETE' OR (NEW.id,NEW.study_id,NEW.participant_id,NEW.group_id,NEW.stage_id) IS DISTINCT FROM (OLD.id,OLD.study_id,OLD.participant_id,OLD.group_id,OLD.stage_id))
    THEN RAISE EXCEPTION 'enrollment scope is frozen' USING ERRCODE='23514'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
CREATE TRIGGER enrollment_frozen BEFORE UPDATE OR DELETE ON stage_enrollments FOR EACH ROW EXECUTE FUNCTION guard_enrollment();
CREATE FUNCTION guard_attempt() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,pedpsy AS $$
BEGIN
  IF TG_OP='INSERT' THEN IF NEW.status<>'draft' THEN RAISE EXCEPTION 'new attempt must be draft' USING ERRCODE='23514'; END IF; RETURN NEW; END IF;
  IF OLD.status='completed' THEN RAISE EXCEPTION 'completed attempt is immutable' USING ERRCODE='23514'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  IF (NEW.id,NEW.study_id,NEW.enrollment_id,NEW.assignment_id,NEW.group_id,NEW.stage_id,NEW.release_id) IS DISTINCT FROM
    (OLD.id,OLD.study_id,OLD.enrollment_id,OLD.assignment_id,OLD.group_id,OLD.stage_id,OLD.release_id) THEN RAISE EXCEPTION 'attempt scope is frozen' USING ERRCODE='23514'; END IF;
  IF NEW.status='completed' THEN
    IF (SELECT count(*) FROM pedpsy.responses WHERE attempt_id=OLD.id)<>30 OR NEW.revision<>OLD.revision+1 OR NOT EXISTS
      (SELECT 1 FROM pedpsy.attempt_results WHERE id=NEW.completion_result_id AND attempt_id=OLD.id AND input_revision=OLD.revision)
      THEN RAISE EXCEPTION 'completion requires full snapshot and matching result' USING ERRCODE='23514'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER attempt_guard BEFORE INSERT OR UPDATE OR DELETE ON attempts FOR EACH ROW EXECUTE FUNCTION guard_attempt();
CREATE FUNCTION guard_response() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,pedpsy AS $$
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') AND COALESCE((SELECT status FROM pedpsy.attempts WHERE id=OLD.attempt_id),'missing')<>'draft'
    THEN RAISE EXCEPTION 'response requires draft' USING ERRCODE='23514'; END IF;
  IF TG_OP IN ('INSERT','UPDATE') AND COALESCE((SELECT status FROM pedpsy.attempts WHERE id=NEW.attempt_id),'missing')<>'draft'
    THEN RAISE EXCEPTION 'response requires draft' USING ERRCODE='23514'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
CREATE TRIGGER response_guard BEFORE INSERT OR UPDATE OR DELETE ON responses FOR EACH ROW EXECUTE FUNCTION guard_response();
