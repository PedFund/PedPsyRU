"use strict";
// Repeat delivery: the application keeps its study/group, the one-time code is
// rotated, the previous code dies, one request per minute, unknown mailbox is neutral.
const {test} = require("node:test"), assert = require("node:assert/strict");
const {postgresFixture} = require("./postgres-fixture.js"), {stageSetup} = require("./participant-enrollment-fixture.js");
const {tokenHash} = require("../dist/src/adapters/postgres/account-transaction.js");
const browserA = "A".repeat(43), browserB = "B".repeat(43);
const body = email => ({email, password: "synthetic resend password", contact_notice_version: "demo-contact-3", accept_contact_notice: true});
async function pendingOf(f, email) {
  return (await f.admin.query("SELECT id,expires_at_ms FROM pedpsy.registration_pending WHERE email_key=$1 AND status='pending' ORDER BY created_at_ms DESC LIMIT 1", [email])).rows[0];
}
async function codeOf(f, x, pending) {
  const out = (await f.admin.query("SELECT id,token_envelope FROM pedpsy.contact_confirmation_outbox WHERE pending_id=$1 ORDER BY created_at_ms DESC LIMIT 1", [pending.id])).rows[0];
  return x.vault.open(out.id, out.token_envelope);
}
test("PostgreSQL resend: a new code replaces the old one for the same application", async t => {
  const f = await postgresFixture({runtimePoolSize:3}); t.after(() => f.close());
  const x = await stageSetup(f); const email = "resend.one@example.test";
  await x.registration.start(x.invite.invite_token, body(email), browserA);
  const pending = await pendingOf(f, email), first = await codeOf(f, x, pending);
  // One minute later the SQL layer issues a fresh code for the same application.
  const deliveryId = (await f.admin.query("SELECT id FROM pedpsy.contact_confirmation_outbox WHERE pending_id=$1", [pending.id])).rows[0].id, second = require("node:crypto").randomBytes(32).toString("base64url");
  const outcome = (await f.admin.query("SELECT pedpsy.reserve_registration_resend($1,$2,$3,$4,$5,$6) outcome",
    [tokenHash(x.invite.invite_token), email, deliveryId, tokenHash(second), x.vault.seal(deliveryId, second), Date.now() + 61000])).rows[0].outcome;
  assert.equal(outcome, "ok");
  await assert.rejects(x.registration.confirm(x.invite.invite_token, {confirmation_token: first}, browserB), e => e.status === 404);
  assert.deepEqual(await x.registration.confirm(x.invite.invite_token, {confirmation_token: second}, browserB), {status: "sign_in_required"});
  const contact = (await f.admin.query("SELECT status FROM pedpsy.participant_contacts WHERE study_id=$1 AND email_key=$2", [x.design.id, email])).rows[0];
  assert.equal(contact.status, "active");
  await assert.rejects(x.registration.confirm(x.invite.invite_token, {confirmation_token: second}, browserB), e => e.status === 404);
});
test("PostgreSQL resend: one request per minute and an unknown mailbox stays neutral", async t => {
  const f = await postgresFixture({runtimePoolSize:3}); t.after(() => f.close());
  const x = await stageSetup(f); const email = "resend.two@example.test";
  await x.registration.start(x.invite.invite_token, body(email), browserA);
  await assert.rejects(x.registration.resend(x.invite.invite_token, {email}), e => e.status === 429 && e.code === "RESEND_THROTTLED");
  assert.deepEqual(await x.registration.resend(x.invite.invite_token, {email: "nobody@example.test"}), {status: "accepted"});
  assert.equal((await f.admin.query("SELECT count(*)::integer n FROM pedpsy.contact_confirmation_outbox o JOIN pedpsy.registration_pending p ON p.id=o.pending_id WHERE p.email_key=$1", [email])).rows[0].n, 1);
});
