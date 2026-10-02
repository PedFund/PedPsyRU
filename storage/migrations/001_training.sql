-- Local synthetic TKI contour only. Authentication/API are separate tasks.
CREATE TABLE users (
  id TEXT PRIMARY KEY NOT NULL CHECK(length(id)=36),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','disabled')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) STRICT;
CREATE TABLE studies (
  id TEXT PRIMARY KEY NOT NULL CHECK(length(id)=36),
  title TEXT NOT NULL CHECK(length(trim(title))>0),
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','active','closed')),
  dataset_kind TEXT NOT NULL DEFAULT 'demo' CHECK(dataset_kind='demo'),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) STRICT;
CREATE TABLE study_memberships (
  study_id TEXT NOT NULL REFERENCES studies(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  role TEXT NOT NULL CHECK(role IN ('researcher','administrator')),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','revoked')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY(study_id,user_id,role)
) STRICT;
CREATE TABLE research_groups (
  id TEXT PRIMARY KEY NOT NULL CHECK(length(id)=36),
  study_id TEXT NOT NULL REFERENCES studies(id),
  name TEXT NOT NULL CHECK(length(trim(name))>0),
  kind TEXT NOT NULL CHECK(kind IN ('control','experimental','other')),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','closed')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(study_id,id)
) STRICT;
CREATE TABLE research_stages (
  id TEXT PRIMARY KEY NOT NULL CHECK(length(id)=36),
  study_id TEXT NOT NULL REFERENCES studies(id),
  code TEXT NOT NULL CHECK(length(trim(code))>0),
  ordinal INTEGER NOT NULL CHECK(ordinal>=0),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','closed')),
  based_on_stage_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK(based_on_stage_id IS NULL OR based_on_stage_id<>id),
  UNIQUE(study_id,id), UNIQUE(study_id,code), UNIQUE(study_id,ordinal),
  FOREIGN KEY(study_id,based_on_stage_id) REFERENCES research_stages(study_id,id)
) STRICT;
CREATE TABLE instrument_releases (
  id TEXT PRIMARY KEY NOT NULL CHECK(length(id)=36),
  method_id TEXT NOT NULL CHECK(method_id='tki_ru_30_pairs'),
  form_id TEXT NOT NULL, form_version TEXT NOT NULL,
  method_version_id TEXT NOT NULL CHECK(method_version_id='tki_ru_30_pairs@1.0.0'),
  handler_version TEXT NOT NULL CHECK(handler_version='tki-contract-0.3.0'),
  contract_version TEXT NOT NULL CHECK(contract_version='1.0'),
  form_digest TEXT NOT NULL CHECK(length(form_digest)=71 AND substr(form_digest,1,7)='sha256:'),
  key_digest TEXT NOT NULL CHECK(key_digest='sha256:45bc0c8a1b3f154fb3da5df629da6c42613609633594c4f5f54014a301cded7d'),
  verification_state TEXT NOT NULL CHECK(verification_state='key_verified'),
  publication_state TEXT NOT NULL CHECK(publication_state='draft'),
  artifact_ref TEXT NOT NULL,
  form_snapshot TEXT NOT NULL CHECK(json_valid(form_snapshot)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(form_id,form_version,method_version_id,handler_version,contract_version)
) STRICT;
CREATE TABLE release_items (
  release_id TEXT NOT NULL REFERENCES instrument_releases(id),
  item_id TEXT NOT NULL,
  ordinal INTEGER NOT NULL CHECK(ordinal BETWEEN 1 AND 30),
  options TEXT NOT NULL CHECK(json_valid(options)),
  CHECK(item_id=printf('q%02d',ordinal)),
  CHECK(COALESCE(json_type(options)='array' AND json_array_length(options)=2
    AND json_extract(options,'$[0].value')='A' AND json_extract(options,'$[1].value')='B'
    AND json_type(options,'$[0].text')='text' AND json_type(options,'$[1].text')='text',0)),
  PRIMARY KEY(release_id,item_id), UNIQUE(release_id,ordinal)
) STRICT;
CREATE TABLE assignments (
  id TEXT PRIMARY KEY NOT NULL CHECK(length(id)=36),
  study_id TEXT NOT NULL REFERENCES studies(id),
  group_id TEXT NOT NULL, stage_id TEXT NOT NULL,
  release_id TEXT NOT NULL REFERENCES instrument_releases(id),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','closed')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(study_id,group_id,stage_id,release_id),
  UNIQUE(study_id,id,group_id,stage_id,release_id),
  FOREIGN KEY(study_id,group_id) REFERENCES research_groups(study_id,id),
  FOREIGN KEY(study_id,stage_id) REFERENCES research_stages(study_id,id)
) STRICT;
CREATE TABLE participants (
  id TEXT PRIMARY KEY NOT NULL CHECK(length(id)=36),
  study_id TEXT NOT NULL REFERENCES studies(id),
  display_code TEXT NOT NULL CHECK(length(trim(display_code))>0),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','excluded')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(study_id,id), UNIQUE(study_id,display_code)
) STRICT;
CREATE TABLE stage_enrollments (
  id TEXT PRIMARY KEY NOT NULL CHECK(length(id)=36),
  study_id TEXT NOT NULL REFERENCES studies(id),
  participant_id TEXT NOT NULL, group_id TEXT NOT NULL, stage_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','excluded')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(study_id,participant_id,stage_id), UNIQUE(study_id,id,group_id,stage_id),
  FOREIGN KEY(study_id,participant_id) REFERENCES participants(study_id,id),
  FOREIGN KEY(study_id,group_id) REFERENCES research_groups(study_id,id),
  FOREIGN KEY(study_id,stage_id) REFERENCES research_stages(study_id,id)
) STRICT;
CREATE TABLE attempts (
  id TEXT PRIMARY KEY NOT NULL CHECK(length(id)=36),
  study_id TEXT NOT NULL REFERENCES studies(id),
  enrollment_id TEXT NOT NULL, assignment_id TEXT NOT NULL,
  group_id TEXT NOT NULL, stage_id TEXT NOT NULL, release_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','completed')),
  revision INTEGER NOT NULL DEFAULT 0 CHECK(revision>=0),
  current_item_id TEXT NOT NULL,
  completion_result_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  completed_at TEXT,
  CHECK((status='draft' AND completed_at IS NULL AND completion_result_id IS NULL)
    OR (status='completed' AND completed_at IS NOT NULL AND completion_result_id IS NOT NULL)),
  UNIQUE(study_id,enrollment_id,assignment_id),
  UNIQUE(study_id,id,release_id), UNIQUE(study_id,id,release_id,status),
  FOREIGN KEY(study_id,enrollment_id,group_id,stage_id)
    REFERENCES stage_enrollments(study_id,id,group_id,stage_id),
  FOREIGN KEY(study_id,assignment_id,group_id,stage_id,release_id)
    REFERENCES assignments(study_id,id,group_id,stage_id,release_id),
  FOREIGN KEY(release_id,current_item_id) REFERENCES release_items(release_id,item_id),
  FOREIGN KEY(study_id,completion_result_id,id,release_id)
    REFERENCES attempt_results(study_id,id,attempt_id,release_id) DEFERRABLE INITIALLY DEFERRED
) STRICT;
CREATE TABLE responses (
  study_id TEXT NOT NULL, attempt_id TEXT NOT NULL, release_id TEXT NOT NULL,
  item_id TEXT NOT NULL, value TEXT NOT NULL CHECK(value IN ('A','B')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY(attempt_id,item_id),
  FOREIGN KEY(study_id,attempt_id,release_id) REFERENCES attempts(study_id,id,release_id),
  FOREIGN KEY(release_id,item_id) REFERENCES release_items(release_id,item_id)
) STRICT;
CREATE TABLE attempt_results (
  id TEXT PRIMARY KEY NOT NULL CHECK(length(id)=36),
  study_id TEXT NOT NULL, attempt_id TEXT NOT NULL UNIQUE, release_id TEXT NOT NULL,
  attempt_status TEXT NOT NULL DEFAULT 'completed' CHECK(attempt_status='completed'),
  input_revision INTEGER NOT NULL CHECK(input_revision>=0),
  responses_digest TEXT NOT NULL CHECK(length(responses_digest)=71 AND substr(responses_digest,1,7)='sha256:'),
  contract_version TEXT NOT NULL CHECK(contract_version='1.0'),
  handler_version TEXT NOT NULL CHECK(handler_version='tki-contract-0.3.0'),
  key_digest TEXT NOT NULL CHECK(key_digest='sha256:45bc0c8a1b3f154fb3da5df629da6c42613609633594c4f5f54014a301cded7d'),
  calculated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  payload TEXT NOT NULL CHECK(json_valid(payload)),
  CHECK(COALESCE(json_extract(payload,'$.status')='scored'
    AND json_extract(payload,'$.method_version_id')='tki_ru_30_pairs@1.0.0'
    AND json_extract(payload,'$.contract_version')=contract_version
    AND json_extract(payload,'$.handler_version')=handler_version
    AND json_extract(payload,'$.calculation.key_digest')=key_digest,0)),
  UNIQUE(study_id,id,attempt_id,release_id),
  FOREIGN KEY(study_id,attempt_id,release_id,attempt_status)
    REFERENCES attempts(study_id,id,release_id,status) DEFERRABLE INITIALLY DEFERRED
) STRICT;
CREATE TABLE seed_runs (
  name TEXT PRIMARY KEY NOT NULL,
  source_digest TEXT NOT NULL,
  manifest TEXT NOT NULL CHECK(json_valid(manifest)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) STRICT;

CREATE INDEX responses_scope ON responses(study_id,attempt_id);
CREATE INDEX assignments_release ON assignments(release_id);
CREATE INDEX attempts_enrollment ON attempts(enrollment_id);
CREATE INDEX attempts_assignment ON attempts(assignment_id);

CREATE TRIGGER release_no_update BEFORE UPDATE ON instrument_releases
BEGIN SELECT RAISE(ABORT,'immutable release'); END;
CREATE TRIGGER release_no_delete BEFORE DELETE ON instrument_releases
BEGIN SELECT RAISE(ABORT,'immutable release'); END;
CREATE TRIGGER items_no_insert_when_assigned BEFORE INSERT ON release_items
WHEN EXISTS(SELECT 1 FROM assignments WHERE release_id=NEW.release_id)
BEGIN SELECT RAISE(ABORT,'assigned release is frozen'); END;
CREATE TRIGGER items_no_update_when_assigned BEFORE UPDATE ON release_items
WHEN EXISTS(SELECT 1 FROM assignments WHERE release_id IN (OLD.release_id,NEW.release_id))
BEGIN SELECT RAISE(ABORT,'assigned release is frozen'); END;
CREATE TRIGGER items_no_delete_when_assigned BEFORE DELETE ON release_items
WHEN EXISTS(SELECT 1 FROM assignments WHERE release_id=OLD.release_id)
BEGIN SELECT RAISE(ABORT,'assigned release is frozen'); END;
CREATE TRIGGER assignment_requires_items BEFORE INSERT ON assignments
WHEN (SELECT count(*) FROM release_items WHERE release_id=NEW.release_id)<>30
BEGIN SELECT RAISE(ABORT,'release must contain 30 items'); END;
CREATE TRIGGER assignment_scope_frozen BEFORE UPDATE OF id,study_id,group_id,stage_id,release_id ON assignments
WHEN EXISTS(SELECT 1 FROM attempts WHERE assignment_id=OLD.id)
BEGIN SELECT RAISE(ABORT,'assignment already has attempts'); END;
CREATE TRIGGER assignment_no_delete_when_used BEFORE DELETE ON assignments
WHEN EXISTS(SELECT 1 FROM attempts WHERE assignment_id=OLD.id)
BEGIN SELECT RAISE(ABORT,'assignment already has attempts'); END;
CREATE TRIGGER assignment_update_requires_items BEFORE UPDATE OF release_id ON assignments
WHEN (SELECT count(*) FROM release_items WHERE release_id=NEW.release_id)<>30
BEGIN SELECT RAISE(ABORT,'release must contain 30 items'); END;
CREATE TRIGGER enrollment_scope_frozen BEFORE UPDATE OF id,study_id,participant_id,group_id,stage_id ON stage_enrollments
WHEN EXISTS(SELECT 1 FROM attempts WHERE enrollment_id=OLD.id)
BEGIN SELECT RAISE(ABORT,'enrollment already has attempts'); END;
CREATE TRIGGER enrollment_no_delete_when_used BEFORE DELETE ON stage_enrollments
WHEN EXISTS(SELECT 1 FROM attempts WHERE enrollment_id=OLD.id)
BEGIN SELECT RAISE(ABORT,'enrollment already has attempts'); END;
CREATE TRIGGER attempt_no_replace BEFORE INSERT ON attempts
WHEN EXISTS(SELECT 1 FROM attempts WHERE id=NEW.id)
BEGIN SELECT RAISE(ABORT,'attempt identity is frozen'); END;
CREATE TRIGGER attempt_scope_frozen BEFORE UPDATE OF id,study_id,enrollment_id,assignment_id,group_id,stage_id,release_id ON attempts
BEGIN SELECT RAISE(ABORT,'attempt identity is frozen'); END;
CREATE TRIGGER attempt_completed_no_update BEFORE UPDATE ON attempts WHEN OLD.status='completed'
BEGIN SELECT RAISE(ABORT,'completed attempt is immutable'); END;
CREATE TRIGGER attempt_completed_no_delete BEFORE DELETE ON attempts WHEN OLD.status='completed'
BEGIN SELECT RAISE(ABORT,'completed attempt is immutable'); END;
CREATE TRIGGER response_insert_draft BEFORE INSERT ON responses
WHEN COALESCE((SELECT status FROM attempts WHERE id=NEW.attempt_id),'missing')<>'draft'
BEGIN SELECT RAISE(ABORT,'response requires draft'); END;
CREATE TRIGGER response_update_draft BEFORE UPDATE ON responses
WHEN COALESCE((SELECT status FROM attempts WHERE id=OLD.attempt_id),'missing')<>'draft'
 OR COALESCE((SELECT status FROM attempts WHERE id=NEW.attempt_id),'missing')<>'draft'
BEGIN SELECT RAISE(ABORT,'response requires draft'); END;
CREATE TRIGGER response_delete_draft BEFORE DELETE ON responses
WHEN COALESCE((SELECT status FROM attempts WHERE id=OLD.attempt_id),'missing')<>'draft'
BEGIN SELECT RAISE(ABORT,'response requires draft'); END;
CREATE TRIGGER result_no_update BEFORE UPDATE ON attempt_results
BEGIN SELECT RAISE(ABORT,'result is immutable'); END;
CREATE TRIGGER result_no_delete BEFORE DELETE ON attempt_results
BEGIN SELECT RAISE(ABORT,'result is immutable'); END;
CREATE TRIGGER attempt_complete_checks BEFORE UPDATE OF status ON attempts WHEN NEW.status='completed'
BEGIN
  SELECT CASE WHEN (SELECT count(*) FROM responses WHERE attempt_id=OLD.id)<>30
    THEN RAISE(ABORT,'complete responses required') END;
  SELECT CASE WHEN NEW.revision<>OLD.revision+1 OR NOT EXISTS(
    SELECT 1 FROM attempt_results WHERE id=NEW.completion_result_id
      AND attempt_id=OLD.id AND input_revision=OLD.revision)
    THEN RAISE(ABORT,'result must match input revision') END;
END;
CREATE TRIGGER attempt_insert_draft BEFORE INSERT ON attempts WHEN NEW.status<>'draft'
BEGIN SELECT RAISE(ABORT,'new attempt must be draft'); END;
