"use strict";
// Participant login by address without an invitation link: the server resolves the
// study when the address belongs to exactly one active participant contact.
const {test} = require("node:test"), assert = require("node:assert/strict"), {createHash} = require("node:crypto");
const {postgresFixture} = require("./postgres-fixture.js"), {stageSetup} = require("./participant-enrollment-fixture.js");
const tokenHash = token => "sha256:" + createHash("sha256").update(token).digest("hex");
test("PostgreSQL participant login: an unambiguous address resolves its study", async t => {
  const f = await postgresFixture({runtimePoolSize:3}); t.after(() => f.close());
  const x = await stageSetup(f);
  const session = await x.registration.login({email: x.email, password: x.password});
  assert.match(session.token, /^[A-Za-z0-9_-]{43}$/);
  const row = (await f.admin.query("SELECT study_id FROM pedpsy.participant_sessions WHERE token_hash=$1 AND revoked_at_ms IS NULL", [tokenHash(session.token)])).rows[0];
  assert.ok(row, "the login created a session");
  assert.equal(row.study_id, x.design.id, "the resolved study is the participant's own");
});
test("PostgreSQL participant login: an unknown address stays a neutral refusal", async t => {
  const f = await postgresFixture({runtimePoolSize:3}); t.after(() => f.close());
  const x = await stageSetup(f);
  await assert.rejects(x.registration.login({email: "nobody@example.test", password: x.password}),
    e => e.status === 401 && e.code === "INVALID_LOGIN");
  await assert.rejects(x.registration.login({email: x.email, password: "wrong synthetic password"}),
    e => e.status === 401 && e.code === "INVALID_LOGIN");
});
