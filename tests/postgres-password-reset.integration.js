"use strict";
// Password reset by e-mailed code: the request is neutral, the stored digest is
// single-use and replaces the credential; the old password stops working.
const {test} = require("node:test"), assert = require("node:assert/strict"), {randomBytes, createHash} = require("node:crypto");
const {postgresFixture} = require("./postgres-fixture.js"), {stageSetup} = require("./participant-enrollment-fixture.js");
const token = () => randomBytes(32).toString("base64url");
const hash = value => "sha256:" + createHash("sha256").update(value).digest("hex");
const body = (email, password) => ({email, password, contact_notice_version: "personal-data-consent-2026-11-24", accept_contact_notice: true});
test("PostgreSQL registration: password reset by e-mailed code replaces the credential", async t => {
  const f = await postgresFixture({runtimePoolSize: 3}); t.after(() => f.close());
  const x = await stageSetup(f), email = "reset.participant@example.test", browser = "B".repeat(43);
  const placeholder = Array.from(randomBytes(18)).map(b => ("0" + b.toString(16)).slice(-2)).join("");
  await x.registration.start(x.invite.invite_token, body(email, placeholder), browser);
  const pending = (await f.admin.query("SELECT id FROM pedpsy.registration_pending WHERE email_key=$1 AND status='pending' ORDER BY created_at_ms DESC LIMIT 1", [email])).rows[0];
  const out = (await f.admin.query("SELECT id,token_envelope FROM pedpsy.contact_confirmation_outbox WHERE pending_id=$1 ORDER BY created_at_ms DESC LIMIT 1", [pending.id])).rows[0];
  const code = x.vault.open(out.id, out.token_envelope);
  await x.registration.confirm(x.invite.invite_token, {confirmation_token: code}, browser);
  await x.registration.setPassword(x.invite.invite_token, {confirmation_token: code, password: "synthetic first password"}, browser);
  assert.deepEqual(await x.registration.forgotPassword(x.invite.invite_token, {email}, browser, ""), {status: "accepted"});
  assert.deepEqual(await x.registration.forgotPassword(x.invite.invite_token, {email: "nobody@example.test"}, browser, ""), {status: "accepted"});
  const resetCode = token(), studyId = (await f.admin.query("SELECT study_id FROM pedpsy.participant_contacts WHERE email_key=$1", [email])).rows[0].study_id;
  const participantId = (await f.admin.query("SELECT participant_id FROM pedpsy.participant_contacts WHERE email_key=$1", [email])).rows[0].participant_id;
  await f.admin.query("INSERT INTO pedpsy.password_resets(id,study_id,participant_id,code_hash,created_at_ms,expires_at_ms,attempts_remaining) VALUES(gen_random_uuid(),$1,$2,$3,$4::bigint,$4::bigint+1800000,5)", [studyId, participantId, hash(resetCode), Date.now()]);
  assert.deepEqual(await x.registration.resetPassword(x.invite.invite_token, {email, code: resetCode, password: "synthetic second password"}, browser, ""), {status: "password_reset"});
  await assert.rejects(x.registration.login({email, password: "synthetic first password"}), e => e.status === 401);
  assert.match((await x.registration.login({email, password: "synthetic second password"})).token, /^[A-Za-z0-9_-]{43}$/);
});
