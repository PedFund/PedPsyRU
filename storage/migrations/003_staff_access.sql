-- Platform staff have global read/export scope, independent of study memberships.
CREATE TABLE staff_credentials (
  id TEXT PRIMARY KEY NOT NULL CHECK(length(id)=36),
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id),
  login_id TEXT NOT NULL UNIQUE CHECK(length(login_id) BETWEEN 3 AND 80),
  role TEXT NOT NULL CHECK(role IN ('administrator','superadministrator')),
  scheme TEXT NOT NULL CHECK(scheme='scrypt-N131072-r8-p1-dk64'),
  salt TEXT NOT NULL CHECK(length(salt)=32),
  password_hash TEXT NOT NULL CHECK(length(password_hash)=128),
  version INTEGER NOT NULL DEFAULT 1 CHECK(version>=1),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','revoked')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(id,user_id,role)
) STRICT;
CREATE TABLE staff_sessions (
  token_hash TEXT PRIMARY KEY NOT NULL CHECK(length(token_hash)=71),
  credential_id TEXT NOT NULL, user_id TEXT NOT NULL, role TEXT NOT NULL,
  credential_version INTEGER NOT NULL CHECK(credential_version>=1),
  created_at_ms INTEGER NOT NULL, last_seen_at_ms INTEGER NOT NULL,
  expires_at_ms INTEGER NOT NULL CHECK(expires_at_ms>created_at_ms),
  revoked_at_ms INTEGER,
  CHECK(last_seen_at_ms>=created_at_ms AND last_seen_at_ms<=expires_at_ms),
  FOREIGN KEY(credential_id,user_id,role) REFERENCES staff_credentials(id,user_id,role)
) STRICT;
CREATE INDEX staff_sessions_credential ON staff_sessions(credential_id);
ALTER TABLE access_audit_events ADD COLUMN actor_role TEXT
  CHECK(actor_role IS NULL OR actor_role IN ('administrator','superadministrator'));
ALTER TABLE access_audit_events ADD COLUMN resource_id TEXT;
ALTER TABLE access_audit_events ADD COLUMN record_count INTEGER CHECK(record_count IS NULL OR record_count>=0);
CREATE TRIGGER staff_identity_frozen BEFORE UPDATE OF id,user_id,login_id,role ON staff_credentials
BEGIN SELECT RAISE(ABORT,'staff identity is frozen'); END;
CREATE TRIGGER staff_no_replace BEFORE INSERT ON staff_credentials
WHEN EXISTS(SELECT 1 FROM staff_credentials WHERE id=NEW.id OR user_id=NEW.user_id OR login_id=NEW.login_id)
BEGIN SELECT RAISE(ABORT,'staff credential already exists'); END;
CREATE TRIGGER staff_no_delete BEFORE DELETE ON staff_credentials
BEGIN SELECT RAISE(ABORT,'revoke credentials instead'); END;
