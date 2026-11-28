"use strict";
// Password reset by e-mailed code: the request is neutral, the stored digest is
// single-use and replaces the credential; the old password stops working. The
// code is captured at the delivery boundary instead of being inserted by hand,
// so the test exercises the real create -> consume path.
const {test} = require("node:test"), assert = require("node:assert/strict"), {randomBytes} = require("node:crypto");
const {postgresFixture} = require("./postgres-fixture.js"), {stageSetup} = require("./participant-enrollment-fixture.js");
const {PostgresParticipantRegistration} = require("../dist/src/adapters/postgres/participant-registration.js");
const body = (email, password) => ({email, password, contact_notice_version: "personal-data-consent-2026-11-24", accept_contact_notice: true});
const codeOf = message => message.text.match(/Код для смены пароля: ([A-Za-z0-9_-]{43})/)[1];
test("PostgreSQL registration: password reset by e-mailed code replaces the credential", async t => {
  const f = await postgresFixture({runtimePoolSize: 3}); t.after(() => f.close());
  const x = await stageSetup(f), email = "reset.participant@example.test", browser = "B".repeat(43), sent = [];
  const placeholder = Array.from(randomBytes(18)).map(b => ("0" + b.toString(16)).slice(-2)).join("");
  await x.registration.start(x.invite.invite_token, body(email, placeholder), browser);
  const pending = (await f.admin.query("SELECT id FROM pedpsy.registration_pending WHERE email_key=$1 AND status='pending' ORDER BY created_at_ms DESC LIMIT 1", [email])).rows[0];
  const out = (await f.admin.query("SELECT id,token_envelope FROM pedpsy.contact_confirmation_outbox WHERE pending_id=$1 ORDER BY created_at_ms DESC LIMIT 1", [pending.id])).rows[0];
  const code = x.vault.open(out.id, out.token_envelope);
  await x.registration.confirm(x.invite.invite_token, {confirmation_token: code}, browser);
  await x.registration.setPassword(x.invite.invite_token, {confirmation_token: code, password: "synthetic first password"}, browser);
  // Same vault as the fixture: the sealed delivery envelope keeps working.
  const registration = new PostgresParticipantRegistration(f.runtime, x.vault, undefined, false, undefined,
    {send: async message => {sent.push(message);}});
  assert.deepEqual(await registration.forgotPassword(x.invite.invite_token, {email}, browser, ""), {status: "accepted"});
  assert.deepEqual(await registration.forgotPassword(x.invite.invite_token, {email: "nobody@example.test"}, browser, ""), {status: "accepted"});
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, email);
  assert.deepEqual(await registration.resetPassword(x.invite.invite_token, {email, code: codeOf(sent[0]), password: "synthetic second password"}, browser, ""), {status: "password_reset"});
  // The same letter cannot be replayed.
  await assert.rejects(registration.resetPassword(x.invite.invite_token, {email, code: codeOf(sent[0]), password: "synthetic third password"}, browser, ""), e => e.status === 404);
  await assert.rejects(x.registration.login({email, password: "synthetic first password"}), e => e.status === 401);
  assert.match((await x.registration.login({email, password: "synthetic second password"})).token, /^[A-Za-z0-9_-]{43}$/);
});
