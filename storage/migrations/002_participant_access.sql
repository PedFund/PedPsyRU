-- Only local synthetic participant access. No public registration/global roles.
CREATE TABLE participant_credentials (
  id TEXT PRIMARY KEY NOT NULL CHECK(length(id)=36),
  study_id TEXT NOT NULL, participant_id TEXT NOT NULL,
  login_id TEXT NOT NULL UNIQUE CHECK(length(login_id) BETWEEN 3 AND 80),
  scheme TEXT NOT NULL CHECK(scheme='scrypt-N131072-r8-p1-dk64'),
  salt TEXT NOT NULL CHECK(length(salt)=32),
  password_hash TEXT NOT NULL CHECK(length(password_hash)=128),
  version INTEGER NOT NULL DEFAULT 1 CHECK(version>=1),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','revoked')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(study_id,participant_id), UNIQUE(id,study_id,participant_id),
  FOREIGN KEY(study_id,participant_id) REFERENCES participants(study_id,id)
) STRICT;
CREATE TABLE participant_sessions (
  token_hash TEXT PRIMARY KEY NOT NULL CHECK(length(token_hash)=71),
  credential_id TEXT NOT NULL, study_id TEXT NOT NULL, participant_id TEXT NOT NULL,
  credential_version INTEGER NOT NULL CHECK(credential_version>=1),
  created_at_ms INTEGER NOT NULL, last_seen_at_ms INTEGER NOT NULL,
  expires_at_ms INTEGER NOT NULL CHECK(expires_at_ms>created_at_ms),
  revoked_at_ms INTEGER,
  CHECK(last_seen_at_ms>=created_at_ms AND last_seen_at_ms<=expires_at_ms),
  FOREIGN KEY(credential_id,study_id,participant_id) REFERENCES participant_credentials(id,study_id,participant_id)
) STRICT;
CREATE INDEX sessions_credential ON participant_sessions(credential_id);
CREATE TABLE login_throttles (
  bucket_hash TEXT PRIMARY KEY NOT NULL CHECK(length(bucket_hash)=71),
  window_start_ms INTEGER NOT NULL,
  count INTEGER NOT NULL CHECK(count>=1)
) STRICT;
CREATE TABLE access_audit_events (
  id TEXT PRIMARY KEY NOT NULL CHECK(length(id)=36),
  at_ms INTEGER NOT NULL,
  credential_id TEXT, study_id TEXT,
  action TEXT NOT NULL, outcome TEXT NOT NULL CHECK(outcome IN ('allow','deny')),
  reason TEXT NOT NULL
) STRICT;
CREATE TRIGGER credentials_scope_frozen BEFORE UPDATE OF id,study_id,participant_id,login_id ON participant_credentials
BEGIN SELECT RAISE(ABORT,'credential identity is frozen'); END;
CREATE TRIGGER credentials_no_replace BEFORE INSERT ON participant_credentials
WHEN EXISTS(SELECT 1 FROM participant_credentials WHERE id=NEW.id OR login_id=NEW.login_id
  OR (study_id=NEW.study_id AND participant_id=NEW.participant_id))
BEGIN SELECT RAISE(ABORT,'credential already exists'); END;
CREATE TRIGGER credentials_no_delete BEFORE DELETE ON participant_credentials
BEGIN SELECT RAISE(ABORT,'revoke credentials instead'); END;
CREATE TRIGGER access_audit_no_update BEFORE UPDATE ON access_audit_events
BEGIN SELECT RAISE(ABORT,'access audit is append only'); END;
CREATE TRIGGER access_audit_no_delete BEFORE DELETE ON access_audit_events
BEGIN SELECT RAISE(ABORT,'access audit is append only'); END;
