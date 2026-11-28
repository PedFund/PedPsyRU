"use strict";
// Password recovery must not depend on the group invitation. The address
// identifies the account and the e-mailed code proves the mailbox. This is the
// pilot regression: the participant client clears the invitation after
// registration and after sign-in, so the reset was refused with NOT_AVAILABLE
// and no letter was ever queued.
const {test} = require("node:test"), assert = require("node:assert/strict"), {randomBytes} = require("node:crypto");
const {postgresFixture} = require("./postgres-fixture.js"), {stageSetup} = require("./participant-enrollment-fixture.js");
const {PostgresParticipantRegistration} = require("../dist/src/adapters/postgres/participant-registration.js");
const {ContactTokenVault} = require("../dist/src/adapters/security/contact-token-vault.js");
const token = () => randomBytes(32).toString("base64url");
const body = (email, password) => ({email, password, contact_notice_version: "personal-data-consent-2026-11-24", accept_contact_notice: true});
const codeOf = message => message.text.match(/Код для смены пароля: ([A-Za-z0-9_-]{43})/)[1];
function recovering(f, sent) {
  // A capturing mailer stands in for SMTP: delivery is the caller's business,
  // the code itself is never exposed by the API.
  return new PostgresParticipantRegistration(f.runtime, new ContactTokenVault(randomBytes(32)), undefined, false, undefined,
    {send: async message => {sent.push(message);}});
}
test("PostgreSQL registration: password reset works without a group invitation", async t => {
  const f = await postgresFixture({runtimePoolSize: 3}); t.after(() => f.close());
  const x = await stageSetup(f), sent = [], registration = recovering(f, sent);
  const email = "recover.participant@example.test", browser = token();
  await registration.direct(x.invite.invite_token, body(email, "synthetic first password"), browser);
  // The page no longer carries the group link: the request has no invitation.
  assert.deepEqual(await registration.forgotPassword("", {email}, token(), ""), {status: "accepted"});
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, email);
  assert.deepEqual((await f.admin.query("SELECT outcome,reason FROM pedpsy.access_audit_events WHERE action='participants.registration.reset_email'")).rows,
    [{outcome: "allow", reason: "SENT"}]);
  assert.deepEqual(await registration.resetPassword("", {email, code: codeOf(sent[0]), password: "synthetic second password"}, token(), ""),
    {status: "password_reset"});
  await assert.rejects(registration.login({email, password: "synthetic first password"}), e => e.status === 401);
  assert.match((await registration.login({email, password: "synthetic second password"})).token, /^[A-Za-z0-9_-]{43}$/);
  // The code is single-use: the same letter cannot replace the password twice.
  await assert.rejects(registration.resetPassword("", {email, code: codeOf(sent[0]), password: "synthetic third password"}, token(), ""),
    e => e.status === 404);
});
test("PostgreSQL registration: reset ignores a stale link and stays neutral for unknown mailboxes", async t => {
  const f = await postgresFixture({runtimePoolSize: 2}); t.after(() => f.close());
  const x = await stageSetup(f), sent = [], registration = recovering(f, sent);
  const email = "stale.link@example.test";
  await registration.direct(x.invite.invite_token, body(email, "synthetic first password"), token());
  // A well-formed digest that belongs to no invitation must not refuse recovery.
  assert.deepEqual(await registration.forgotPassword(token(), {email}, token(), ""), {status: "accepted"});
  assert.equal(sent.length, 1);
  // An unknown address learns nothing: neutral answer, no row, no letter.
  assert.deepEqual(await registration.forgotPassword("", {email: "nobody@example.test"}, token(), ""), {status: "accepted"});
  assert.equal(sent.length, 1);
  const unknown = (await f.admin.query("SELECT count(*)::int AS n FROM pedpsy.password_resets r JOIN pedpsy.participant_contacts c ON (c.study_id,c.participant_id)=(r.study_id,r.participant_id) WHERE c.email_key=$1", ["nobody@example.test"])).rows[0];
  assert.equal(unknown.n, 0);
  // A wrong code is refused and leaves the credential untouched.
  await assert.rejects(registration.resetPassword("", {email, code: token(), password: "synthetic second password"}, token(), ""),
    e => e.status === 404);
  assert.match((await registration.login({email, password: "synthetic first password"})).token, /^[A-Za-z0-9_-]{43}$/);
  assert.deepEqual(await registration.resetPassword("", {email, code: codeOf(sent[0]), password: "synthetic second password"}, token(), ""),
    {status: "password_reset"});
});
test("PostgreSQL registration: the study link still scopes recovery when it is present", async t => {
  const f = await postgresFixture({runtimePoolSize: 2}); t.after(() => f.close());
  const x = await stageSetup(f), sent = [], registration = recovering(f, sent);
  const email = "linked.reset@example.test";
  await registration.direct(x.invite.invite_token, body(email, "synthetic first password"), token());
  assert.deepEqual(await registration.forgotPassword(x.invite.invite_token, {email}, token(), ""), {status: "accepted"});
  assert.equal(sent.length, 1);
  const row = (await f.admin.query("SELECT r.study_id FROM pedpsy.password_resets r JOIN pedpsy.participant_contacts c ON (c.study_id,c.participant_id)=(r.study_id,r.participant_id) WHERE c.email_key=$1 ORDER BY r.created_at_ms DESC LIMIT 1", [email])).rows[0];
  assert.equal(row.study_id, x.design.id);
  assert.deepEqual(await registration.resetPassword(x.invite.invite_token, {email, code: codeOf(sent[0]), password: "synthetic second password"}, token(), ""),
    {status: "password_reset"});
  assert.match((await registration.login({email, password: "synthetic second password"})).token, /^[A-Za-z0-9_-]{43}$/);
});
