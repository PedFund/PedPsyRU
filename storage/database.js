"use strict";

const {DatabaseSync} = require("node:sqlite");
const {readFileSync, readdirSync} = require("node:fs");
const path = require("node:path");
const {createHash} = require("node:crypto");
const MIGRATIONS = path.join(__dirname, "migrations");
const APPLICATION_ID = 0x5050444d; // PPDM: local PedPsy demo, not an access credential.
const sha256 = text => "sha256:" + createHash("sha256").update(text).digest("hex");

function transaction(db, operation) {
  if (db.isTransaction) throw new Error("NESTED_TRANSACTION");
  db.exec("BEGIN IMMEDIATE");
  try {
    const value = operation();
    if (value && typeof value.then === "function") throw new Error("ASYNC_TRANSACTION_NOT_SUPPORTED");
    db.exec("COMMIT");
    return value;
  } catch (error) {
    if (db.isTransaction) db.exec("ROLLBACK");
    throw error;
  }
}

function openDatabase(filename = ":memory:", {readOnly = false} = {}) {
  const db = new DatabaseSync(filename, {readOnly, enableForeignKeyConstraints: true, timeout: 3000});
  try {
    const identity = db.prepare("PRAGMA application_id").get().application_id;
    const tables = db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
    if (identity !== APPLICATION_ID && (identity !== 0 || tables.length)) throw new Error("NOT_A_TRAINING_DATABASE");
    db.exec("PRAGMA recursive_triggers=ON"); // REPLACE must not bypass immutable DELETE guards.
    if (db.prepare("PRAGMA foreign_keys").get().foreign_keys !== 1) throw new Error("FOREIGN_KEYS_DISABLED");
    return db;
  } catch (error) {db.close(); throw error;}
}

function migrate(db, migrationsDirectory = MIGRATIONS) {
  // Append-only numbered UTF-8 SQL; checksum mismatch/missing migration fails closed.
  const files = readdirSync(migrationsDirectory).filter(name => /^\d{3}_[a-z0-9_]+\.sql$/.test(name)).sort();
  if (!files.length) throw new Error("NO_MIGRATIONS");
  const migrations = files.map(name => ({version: Number(name.slice(0, 3)), name, sql: readFileSync(path.join(migrationsDirectory, name), "utf8")}));
  if (migrations.some((m, i) => m.version !== i + 1)) throw new Error("MIGRATION_SEQUENCE_INVALID");
  return transaction(db, () => {
    db.exec(`PRAGMA application_id=${APPLICATION_ID};
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY NOT NULL,
        name TEXT NOT NULL UNIQUE, digest TEXT NOT NULL,
        applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      ) STRICT;`);
    const applied = db.prepare("SELECT version,name,digest FROM schema_migrations ORDER BY version").all();
    for (const [index, row] of applied.entries()) {
      const migration = migrations[index];
      if (!migration || row.version !== migration.version || row.name !== migration.name || row.digest !== sha256(migration.sql)) {
        throw new Error("MIGRATION_HISTORY_MISMATCH");
      }
    }
    for (const migration of migrations.slice(applied.length)) {
      db.exec(migration.sql);
      db.prepare("INSERT INTO schema_migrations(version,name,digest) VALUES(?,?,?)").run(migration.version, migration.name, sha256(migration.sql));
    }
    if (db.prepare("PRAGMA foreign_key_check").all().length) throw new Error("FOREIGN_KEY_CHECK_FAILED");
    return migrations.length - applied.length;
  });
}

module.exports = {openDatabase, migrate, transaction, sha256};
