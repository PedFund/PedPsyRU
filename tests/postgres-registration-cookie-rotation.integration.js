"use strict";
// A confirmation code must survive a rotated pending-browser cookie: the owner can
// request the code in one tab or browser and confirm in another. The code itself is
// the 256-bit secret, so it resolves the pending row within the same invitation.
const {test} = require("node:test"), assert = require("node:assert/strict");
const {postgresFixture} = require("./postgres-fixture.js"), {stageSetup} = require("./participant-enrollment-fixture.js");
const browserA = "A".repeat(43), browserB = "B".repeat(43), browserC = "C".repeat(43);
test("PostgreSQL confirmation: a rotated browser cookie still accepts the e-mailed code", async t => {
  const f = await postgresFixture({runtimePoolSize:3}); t.after(() => f.close());
  const x = await stageSetup(f);
  const start = await x.registration.start(x.invite.invite_token, {email: "rotation@example.test", password: "synthetic rotation password",
    contact_notice_version: "demo-contact-3", accept_contact_notice: true}, browserA);
  assert.ok(["confirmation_requested", "sign_in_required"].includes(start.status));
  const pending = (await f.admin.query("SELECT id FROM pedpsy.registration_pending WHERE email_key='rotation@example.test' ORDER BY created_at_ms DESC LIMIT 1")).rows[0];
  const out = (await f.admin.query("SELECT id,token_envelope FROM pedpsy.contact_confirmation_outbox WHERE pending_id=$1 ORDER BY created_at_ms DESC LIMIT 1", [pending.id])).rows[0];
  const code = x.vault.open(out.id, out.token_envelope);
  assert.match(code, /^[A-Za-z0-9_-]{20,80}$/);
  // A different browser proves possession of the code and must be able to confirm.
  const accepted = await x.registration.confirm(x.invite.invite_token, {confirmation_token: code}, browserB);
  assert.deepEqual(accepted, {status: "sign_in_required"});
  const contact = (await f.admin.query("SELECT status FROM pedpsy.participant_contacts WHERE study_id=$1 AND email_key='rotation@example.test'", [x.design.id])).rows[0];
  assert.equal(contact.status, "active");
});
test("PostgreSQL confirmation: a wrong code still fails and consumes an attempt", async t => {
  const f = await postgresFixture({runtimePoolSize:3}); t.after(() => f.close());
  const x = await stageSetup(f);
  await x.registration.start(x.invite.invite_token, {email: "wrong.code@example.test", password: "synthetic wrong code password",
    contact_notice_version: "demo-contact-3", accept_contact_notice: true}, browserC);
  await assert.rejects(x.registration.confirm(x.invite.invite_token, {confirmation_token: "Z".repeat(43)}, browserC), e => e.status === 404);
  const row = (await f.admin.query("SELECT attempts_remaining FROM pedpsy.registration_pending WHERE email_key='wrong.code@example.test'")).rows[0];
  assert.equal(row.attempts_remaining, 4);
});
