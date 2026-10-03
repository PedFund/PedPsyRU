"use strict";
const {test} = require("node:test"), assert = require("node:assert/strict"), {randomBytes} = require("node:crypto");
const {postgresFixture} = require("./postgres-fixture.js");
const {prepareOwnedDatabase, bootstrapFirst} = require("../scripts/local-demo.js");
const {PostgresStaffPassword} = require("../dist/src/adapters/postgres/staff-password.js");
const {PostgresAccountAccess} = require("../dist/src/adapters/postgres/account-access.js");
test("PostgreSQL local demo: existing migrations and verified fresh seed, no credentials; repeat refuses overwrite", async t => {
  const f = await postgresFixture({seedData: false, initialize: false}); t.after(() => f.close());
  const c = await f.admin.connect();
  try {
    await prepareOwnedDatabase(c, f.runtimeRole);
    assert.equal((await c.query("SELECT count(*)::int n FROM pedpsy.studies WHERE dataset_kind='demo'")).rows[0].n, 2);
    for (const table of ["staff_credentials", "staff_sessions", "researcher_credentials", "participant_credentials"])
      assert.equal((await c.query("SELECT count(*)::int n FROM pedpsy." + table)).rows[0].n, 0);
    const before = (await c.query("SELECT id,revision FROM pedpsy.attempts ORDER BY id")).rows;
    await assert.rejects(prepareOwnedDatabase(c, f.runtimeRole), /EMPTY_TARGET_REQUIRED/);
    assert.deepEqual((await c.query("SELECT id,revision FROM pedpsy.attempts ORDER BY id")).rows, before);
    await assert.rejects(f.runtime.query("SELECT * FROM pedpsy.staff_credentials"), e => e.code === "42501");
  } finally {c.release();}
});
test("PostgreSQL local demo: first owner bootstrap is audited, one-use, no MFA shortcut or runtime provisioning", async t => {
  const f = await postgresFixture(); t.after(() => f.close()); const c = await f.admin.connect();
  const password = randomBytes(24).toString("base64url");
  try {
    await bootstrapFirst(c, "PEDPSY-OWNER", password);
    assert.equal((await c.query("SELECT count(*)::int n FROM pedpsy.access_audit_events WHERE action='staff_bootstrap' AND outcome='allow'")).rows[0].n, 1);
    assert.equal((await c.query("SELECT count(*)::int n FROM pedpsy.staff_sessions")).rows[0].n, 0);
    await assert.rejects(bootstrapFirst(c, "PEDPSY-OWNER", randomBytes(24).toString("base64url")), e => e.code === "23514");
    await assert.rejects(bootstrapFirst(f.runtime, "PEDPSY-OWNER", password), e => e.code === "42501");
    const challenge = await new PostgresStaffPassword(f.runtime).password({login_id: "PEDPSY-OWNER", password});
    assert.equal(challenge.status, "mfa_required");
    await assert.rejects(new PostgresAccountAccess(f.runtime).session(challenge.challenge), e => e.status === 401);
    assert.equal((await c.query("SELECT count(*)::int n FROM pedpsy.staff_credentials")).rows[0].n, 1);
  } finally {c.release();}
});
