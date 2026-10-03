"use strict";
const {test} = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const {randomUUID, randomBytes} = require("node:crypto");
const {sha256} = require("../storage/database.js");
const {postgresFixture} = require("./postgres-fixture.js");
const {migratePostgres} = require("../dist/src/adapters/postgres/migrate.js");
function scenario(title, callback) {test("PostgreSQL schema: " + title, async t => {const f = await postgresFixture(); t.after(() => f.close()); await callback(f);});}
scenario("repeat migration is idempotent and checksum change fails closed", async f => {
  const client = await f.admin.connect();
  try {
    assert.equal(await migratePostgres(client, path.join(__dirname, "../storage/postgres")), 0);
    await client.query("UPDATE public.pedpsy_schema_migrations SET digest='modified' WHERE version=1");
    await assert.rejects(migratePostgres(client, path.join(__dirname, "../storage/postgres")), /MIGRATION_HISTORY_MISMATCH/);
    assert.equal((await client.query("SELECT count(*)::integer n FROM pedpsy.attempts")).rows[0].n, 18);
  } finally {client.release();}
});
scenario("runtime is not owner/superuser/BYPASSRLS; no credentials, DDL or role administration", async f => {
  const role = (await f.runtime.query("SELECT rolsuper,rolbypassrls,rolcreaterole,rolcreatedb FROM pg_roles WHERE rolname=current_user")).rows[0];
  assert.deepEqual(role, {rolsuper: false, rolbypassrls: false, rolcreaterole: false, rolcreatedb: false});
  assert.equal((await f.runtime.query("SELECT count(*)::integer n FROM pg_class WHERE relowner=(SELECT oid FROM pg_roles WHERE rolname=current_user)")).rows[0].n, 0);
  for (const sql of ["SELECT * FROM pedpsy.participant_credentials", "SELECT * FROM pedpsy.participant_sessions", "SELECT * FROM pedpsy.staff_credentials",
    "UPDATE pedpsy.instrument_releases SET form_version='changed'", "ALTER TABLE pedpsy.attempts DISABLE ROW LEVEL SECURITY", "CREATE ROLE forbidden_runtime_role"]) {
    await assert.rejects(f.runtime.query(sql), e => e.code === "42501");
  }
});
scenario("RLS hides all diagnostic rows without a real session and isolates own attempts", async f => {
  assert.equal((await f.runtime.query("SELECT * FROM pedpsy.attempts")).rowCount, 0);
  await f.withSession(async client => {
    const attempts = await client.query("SELECT * FROM pedpsy.attempts ORDER BY id"); assert.equal(attempts.rowCount, 3);
    assert.ok(attempts.rows.every(a => a.study_id === f.studyId));
    assert.equal((await client.query("SELECT * FROM pedpsy.responses")).rowCount, 2);
    const foreign = f.seed.studies[0].attempts.find(a => a.participant_id !== f.participant.id);
    assert.equal((await client.query("SELECT * FROM pedpsy.attempts WHERE id=$1", [foreign.id])).rowCount, 0);
  });
});
scenario("client role/scope labels never authorize and transaction context does not leak", async f => {
  await f.withSession(async client => {
    await client.query("SELECT set_config('app.role','superadministrator',true),set_config('app.participant_id',$1,true)", [f.seed.studies[1].participants[0].id]);
    assert.equal((await client.query("SELECT * FROM pedpsy.attempts")).rowCount, 0);
  }, sha256("synthetic missing capability"));
  await f.withSession(async client => assert.equal((await client.query("SELECT * FROM pedpsy.attempts")).rowCount, 3));
  assert.equal((await f.runtime.query("SELECT * FROM pedpsy.attempts")).rowCount, 0);
});
scenario("revoked session immediately loses RLS visibility", async f => {
  await f.admin.query("UPDATE pedpsy.participant_sessions SET revoked_at_ms=$1 WHERE token_hash=$2", [Date.now(), f.hash]);
  await f.withSession(async client => {assert.equal((await client.query("SELECT * FROM pedpsy.attempts")).rowCount, 0); assert.equal((await client.query("SELECT * FROM pedpsy.session_actor()")).rowCount, 0);});
});
scenario("both staff roles read globally only with MFA and cannot write participant data", async f => {
  for (const role of ["administrator", "superadministrator"]) {
    const id = randomUUID(), user = randomUUID(), token = sha256(randomBytes(32).toString("hex")), at = Date.now();
    await f.admin.query("INSERT INTO pedpsy.users(id) VALUES($1)", [user]);
    await f.admin.query("INSERT INTO pedpsy.staff_credentials(id,user_id,login_id,role,scheme,salt,password_hash) VALUES($1,$2,$3,$4,'scrypt-N131072-r8-p1-dk64',$5,$6)", [id, user, "SYNTHETIC-" + role, role, randomBytes(16).toString("hex"), randomBytes(64).toString("hex")]);
    await f.admin.query("INSERT INTO pedpsy.staff_sessions(token_hash,credential_id,user_id,role,credential_version,created_at_ms,last_seen_at_ms,expires_at_ms) VALUES($1,$2,$3,$4,1,$5,$5,$6)", [token, id, user, role, at, at + 1800000]);
    await f.withSession(async client => assert.equal((await client.query("SELECT * FROM pedpsy.attempts")).rowCount, 0), token);
    await f.admin.query("UPDATE pedpsy.staff_sessions SET mfa_verified_at=to_timestamp($1/1000.0) WHERE token_hash=$2", [at, token]);
    await f.withSession(async client => {
      assert.equal((await client.query("SELECT * FROM pedpsy.attempts")).rowCount, 18);
      assert.equal((await client.query("SELECT * FROM pedpsy.responses")).rowCount, 4);
      assert.equal((await client.query("UPDATE pedpsy.attempts SET revision=revision+1")).rowCount, 0);
      assert.equal((await client.query("DELETE FROM pedpsy.responses")).rowCount, 0);
    }, token);
  }
});
scenario("composite scope FK, A/B and frozen release guards reject invalid changes", async f => {
  const own = f.seed.studies[0].attempts[0];
  await assert.rejects(f.admin.query("INSERT INTO pedpsy.responses(study_id,attempt_id,release_id,item_id,value) VALUES($1,$2,$3,'q03','A')", [f.seed.studies[1].id, own.id, f.seed.release_id]), e => e.code === "23503");
  await assert.rejects(f.admin.query("INSERT INTO pedpsy.responses(study_id,attempt_id,release_id,item_id,value) VALUES($1,$2,$3,'q03','C')", [f.studyId, own.id, f.seed.release_id]), e => e.code === "23514");
  await assert.rejects(f.admin.query("UPDATE pedpsy.instrument_releases SET form_version='changed'"), e => e.code === "23514");
  await assert.rejects(f.admin.query("UPDATE pedpsy.release_items SET options='[]'::jsonb"), e => e.code === "23514");
  await assert.rejects(f.admin.query("UPDATE pedpsy.attempts SET status='completed',completed_at=now(),completion_result_id=$1 WHERE id=$2", [randomUUID(), own.id]), e => e.code === "23514");
});
