"use strict";
// The participant chooses the password after confirming the e-mailed code. The code is
// the proof, the step is single-use and only an active contact gets the new password.
const {test} = require("node:test"), assert = require("node:assert/strict"), {randomBytes} = require("node:crypto");
const {postgresFixture} = require("./postgres-fixture.js"), {stageSetup} = require("./participant-enrollment-fixture.js");
const token = () => randomBytes(32).toString("base64url");
const body = (email, password) => ({email, password, contact_notice_version: "personal-data-consent-2026-11-24", accept_contact_notice: true});
async function codeFor(f, x, email) {
  const pending = (await f.admin.query("SELECT id FROM pedpsy.registration_pending WHERE email_key=$1 AND status='pending' ORDER BY created_at_ms DESC LIMIT 1", [email])).rows[0];
  const out = (await f.admin.query("SELECT id,token_envelope FROM pedpsy.contact_confirmation_outbox WHERE pending_id=$1 ORDER BY created_at_ms DESC LIMIT 1", [pending.id])).rows[0];
  return x.vault.open(out.id, out.token_envelope);
}
test("PostgreSQL registration: the password is set after the code and is single-use", async t => {
  const f = await postgresFixture({runtimePoolSize: 3}); t.after(() => f.close());
  const x = await stageSetup(f); const email = "password.after.code@example.test", browser = "A".repeat(43);
  const placeholder = Array.from(randomBytes(18)).map(b => ("0" + b.toString(16)).slice(-2)).join("");
  await x.registration.start(x.invite.invite_token, body(email, placeholder), browser);
  const code = await codeFor(f, x, email);
  assert.deepEqual(await x.registration.confirm(x.invite.invite_token, {confirmation_token: code}, browser), {status: "sign_in_required"});
  assert.deepEqual(await x.registration.setPassword(x.invite.invite_token, {confirmation_token: code, password: "synthetic chosen password"}, browser), {status: "password_set"});
  await assert.rejects(x.registration.login({email, password: placeholder}), e => e.status === 401);
  const session = await x.registration.login({email, password: "synthetic chosen password"});
  assert.match(session.token, /^[A-Za-z0-9_-]{43}$/);
  await assert.rejects(x.registration.setPassword(x.invite.invite_token, {confirmation_token: code, password: "synthetic another password"}, browser), e => e.status === 404);
});
