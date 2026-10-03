"use strict";
const path = require("node:path");
const {randomBytes, randomUUID} = require("node:crypto");
const {Pool} = require("pg");
const {openDatabase, migrate} = require("../storage/database.js");
const {importTkiRelease} = require("../storage/releases.js");
const {seedTraining} = require("../storage/seed.js");
const {migratePostgres, grantRuntime} = require("../dist/src/adapters/postgres/migrate.js");
const {sha256} = require("../storage/database.js");
// Test-only provisioning, never a server startup migration or production seed.
async function postgresFixture({runtimePoolSize = 1} = {}) {
  if (process.env.PEDPSY_PG_TEST !== "1" || !["127.0.0.1", "localhost"].includes(process.env.PGTEST_HOST)) throw new Error("EXPLICIT_LOCAL_PG_TEST_REQUIRED");
  const port = Number(process.env.PGTEST_PORT); if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("INVALID_PG_TEST_PORT");
  const suffix = randomBytes(8).toString("hex"), database = "pedpsy_ci_" + suffix, runtimeRole = "pedpsy_runtime_" + suffix;
  const config = {host: process.env.PGTEST_HOST, port, user: "postgres", database: "postgres", max: 2, connectionTimeoutMillis: 5000, idleTimeoutMillis: 5000};
  const control = new Pool(config); const owner = await control.connect();
  let admin, runtime;
  try {
    await owner.query(`CREATE DATABASE "${database}"`);
    // Name is generated/validated, password is generated and never logged.
    const secret = randomBytes(32).toString("hex");
    const ddl = await owner.query("SELECT format('CREATE ROLE %I LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS', $1::text, $2::text) AS ddl", [runtimeRole, secret]);
    await owner.query(ddl.rows[0].ddl);
    admin = new Pool({...config, database});
    const client = await admin.connect();
    try {await migratePostgres(client, path.join(__dirname, "../storage/postgres")); await grantRuntime(client, runtimeRole);} finally {client.release();}
    runtime = new Pool({...config, database, user: runtimeRole, password: secret, max: runtimePoolSize});
    const sqlite = openDatabase(); let seed;
    try {
      migrate(sqlite); const release = importTkiRelease(sqlite); seed = seedTraining(sqlite, release);
      const seedClient = await admin.connect(); await seedClient.query("BEGIN");
      try {
        const tables = ["users", "studies", "study_memberships", "research_groups", "research_stages", "instrument_releases", "release_items", "assignments", "participants", "stage_enrollments", "attempts", "responses", "seed_runs"];
        for (const table of tables) for (const row of sqlite.prepare("SELECT * FROM " + table + (table === "research_stages" ? " ORDER BY study_id,ordinal" : "")).all()) {
          const columns = Object.keys(row); const values = columns.map(key => row[key]);
          await seedClient.query(`INSERT INTO pedpsy.${table}(${columns.map(x => '"' + x + '"').join(",")}) VALUES(${columns.map((_, i) => "$" + (i + 1)).join(",")})`, values);
        }
        await seedClient.query("COMMIT");
      } catch (error) {await seedClient.query("ROLLBACK"); throw error;} finally {seedClient.release();}
    } finally {sqlite.close();}
    const participant = seed.studies[0].participants[0], studyId = seed.studies[0].id;
    const credential = randomUUID(), raw = randomBytes(32).toString("base64url"), hash = sha256(raw), at = Date.now();
    await admin.query("INSERT INTO pedpsy.participant_credentials(id,study_id,participant_id,login_id,scheme,salt,password_hash) VALUES($1,$2,$3,'SYNTHETIC-RLS','scrypt-N131072-r8-p1-dk64',$4,$5)", [credential, studyId, participant.id, randomBytes(16).toString("hex"), randomBytes(64).toString("hex")]);
    await admin.query("INSERT INTO pedpsy.participant_sessions(token_hash,credential_id,study_id,participant_id,credential_version,created_at_ms,last_seen_at_ms,expires_at_ms) VALUES($1,$2,$3,$4,1,$5,$5,$6)", [hash, credential, studyId, participant.id, at, at + 1800000]);
    let closed = false;
    return {admin, runtime, seed, hash, raw, credential, participant, studyId, runtimeRole, database,
      withSession: async (callback, session = hash) => {
        const client = await runtime.connect(); await client.query("BEGIN");
        try {await client.query("SELECT set_config('app.session_hash',$1,true)", [session]); const result = await callback(client); await client.query("COMMIT"); return result;}
        catch (error) {await client.query("ROLLBACK"); throw error;} finally {client.release();}
      },
      close: async () => {
        if (closed) return; closed = true;
        await runtime.end(); await admin.end();
        // Destructive targets are exact generated synthetic database/role names.
        if (!/^pedpsy_ci_[a-f0-9]{16}$/.test(database) || !/^pedpsy_runtime_[a-f0-9]{16}$/.test(runtimeRole)) throw new Error("UNSAFE_CLEANUP_TARGET");
        await owner.query(`DROP DATABASE "${database}"`); await owner.query(`DROP ROLE "${runtimeRole}"`); owner.release(); await control.end();
      }};
  } catch (error) {
    if (runtime) await runtime.end(); if (admin) await admin.end();
    await owner.query(`DROP DATABASE IF EXISTS "${database}"`); await owner.query(`DROP ROLE IF EXISTS "${runtimeRole}"`); owner.release(); await control.end();
    throw error;
  }
}
module.exports = {postgresFixture};
