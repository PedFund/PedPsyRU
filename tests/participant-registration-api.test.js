"use strict";
const {test} = require("node:test"), assert = require("node:assert/strict");
const {participantEmail, participantEmailLogin, registrationStart, registrationConfirmation, registrationToken,
  createParticipantRegistrationApi, createGroupInvitationApi} = require("../dist/src/application/participant-registration-api.js");
const id = "12345678-1234-1234-1234-123456789012", invite = "i".repeat(43), pending = "p".repeat(43), confirmation = "c".repeat(43);
const good = {email: "Demo.Owner+tag@EXAMPLE.test", password: "synthetic password", contact_notice_version: "contact-1", accept_contact_notice: true};
const invalid = e => e.status === 400 && e.code === "INVALID_REGISTRATION_INPUT";
const unavailable = e => e.status === 404 && e.code === "NOT_AVAILABLE";
test("email comparison is explicit: only DNS domain is folded, local case/dots/+ tags remain", () => {
  assert.equal(participantEmail(good.email), "Demo.Owner+tag@example.test");
  assert.notEqual(participantEmail("Owner@example.test"), participantEmail("owner@example.test"));
  assert.notEqual(participantEmail("owner+tag@example.test"), participantEmail("owner@example.test"));
  assert.notEqual(participantEmail("o.wner@example.test"), participantEmail("owner@example.test"));
  assert.equal(participantEmail("a@xn--p1ai.example"), "a@xn--p1ai.example");
});
test("email excludes header injection, ambiguous whitespace, quoted/Unicode format and excessive labels", () => {
  for (const email of [null, [], {}, 42, "", "a@example.test\r\nBcc:other@example.test", " a@example.test", "a@example.test ",
    "a@@example.test", ".a@example.test", "a..b@example.test", "a.@example.test", "\"a b\"@example.test",
    "почта@example.test", "a@пример.test", "a@localhost", "a@-example.test", "a@example-.test", "a@example..test",
    "a".repeat(65)+"@example.test", "a@"+"b".repeat(64)+".test", "a@"+"b".repeat(63)+"."+"b".repeat(63)+"."+"b".repeat(63)+"."+"b".repeat(63)])
    assert.throws(() => participantEmail(email), invalid);
});
test("registration is exactly four fields, with explicit notice acceptance and no client authority", () => {
  assert.deepEqual(registrationStart(good), {...good, email: "Demo.Owner+tag@example.test"});
  for (const field of ["study_id", "group_id", "stage_id", "participant_id", "role", "scores", "contact_confirmed", "passport_version"])
    assert.throws(() => registrationStart({...good, [field]: id}), invalid);
  for (const value of [false, "true", 1, null]) assert.throws(() => registrationStart({...good, accept_contact_notice: value}), invalid);
  for (const value of [null, [], {}, "contains space", "x".repeat(81), "contact\n1"])
    assert.throws(() => registrationStart({...good, contact_notice_version: value}), invalid);
  for (const value of [null, [], good.email, {email: good.email}]) assert.throws(() => registrationStart(value), invalid);
});
test("passwords keep whitespace, use UTF-8 bounds and are not coerced or trimmed", () => {
  const spaced = "  synthetic password  ";
  assert.equal(registrationStart({...good, password: spaced}).password, spaced);
  for (const password of [null, [], 123456789012, "short", "x".repeat(257), "Ж".repeat(129), "😀".repeat(65), "long\npassword", "long\u0000password"])
    assert.throws(() => registrationStart({...good, password}), invalid);
  for (const password of ["x".repeat(256), "Ж".repeat(128), "😀".repeat(64)])
    assert.equal(registrationStart({...good, password}).password, password);
});
test("only opaque token strings are accepted; confirmation has no password/group/role replacement", () => {
  assert.equal(registrationToken(invite), invite);
  assert.deepEqual(registrationConfirmation({confirmation_token: confirmation}), {confirmation_token: confirmation});
  for (const token of [null, [], "x".repeat(42), "x".repeat(44), "x".repeat(42)+"=", " https://example.test/"])
    assert.throws(() => registrationToken(token), unavailable);
  for (const input of [{confirmation_token: confirmation, password: good.password}, {confirmation_token: confirmation, role: "superadministrator"},
    {confirmation_token: confirmation, group_id: id}, {confirmation_token: confirmation, study_id: id}, {}, null])
    assert.throws(() => registrationConfirmation(input), invalid);
});
test("email login is explicitly study-scoped and accepts no cross-study/global realm selection", () => {
  assert.deepEqual(participantEmailLogin({study_id: id, email: good.email, password: good.password}),
    {study_id: id, email: "Demo.Owner+tag@example.test", password: good.password});
  for (const input of [{email: good.email, password: good.password}, {study_id: id, email: good.email, password: good.password, group_id: id},
    {study_id: id, email: good.email, password: good.password, role: "researcher"}]) assert.throws(() => participantEmailLogin(input), invalid);
  assert.throws(() => participantEmailLogin({study_id: "*", email: good.email, password: good.password}), unavailable);
});
test("registration and confirmation bind to a protected pending browser, and emit neutral whitelisted DTOs", async () => {
  const calls = [], protection = {assert: (token, csrf) => {if (token !== pending || csrf !== "csrf") throw Error("csrf");}};
  const api = createParticipantRegistrationApi({
    start: async (...args) => {calls.push(args); return {status: "confirmation_requested", existing_email: true, participant_id: id};},
    confirm: async (...args) => {calls.push(args); return {status: "sign_in_required", password_hash: "not-public", session_token: "not-public"};}
  }, protection);
  assert.throws(() => api.start(invite, good, pending, "bad"), /csrf/);
  assert.throws(() => api.confirm(invite, {confirmation_token: confirmation}, "other-browser", "csrf"), /csrf/);
  assert.equal(calls.length, 0);
  assert.deepEqual(await api.start(invite, good, pending, "csrf"), {status: "confirmation_requested"});
  assert.deepEqual(await api.confirm(invite, {confirmation_token: confirmation}, pending, "csrf"), {status: "sign_in_required"});
  assert.deepEqual(calls, [[invite, registrationStart(good), pending], [invite, {confirmation_token: confirmation}, pending]]);
});
test("landing and login projection do not forward contact lists, secrets or administrative roles", async () => {
  let resolved = false;
  const api = createParticipantRegistrationApi({
    landing: async () => {resolved = true; return {study_title: "Демо", group_name: "КГ", contacts: ["not-public"],
      contact_notice: {version: "contact-1", text: "Учебный текст", legal_status: "approved", secret: "not-public"}};},
    login: async () => ({token: pending, csrf: "csrf", expiresAt: 1234, role: "superadministrator", email: good.email})
  }, {assert: () => {}});
  await assert.rejects(api.landing("bad-token"), unavailable); assert.equal(resolved, false);
  assert.deepEqual(await api.landing(invite), {study_title: "Демо", group_name: "КГ", contact_notice:
    {version: "contact-1", text: "Учебный текст", legal_status: "synthetic_only"}});
  assert.deepEqual(await api.login({study_id: id, email: good.email, password: good.password}), {token: pending, csrf: "csrf", expiresAt: 1234});
});
test("invitation management rejects client owner/scope/token and coerced CAS/expiry before calling adapter", async () => {
  const calls = [], record = {id, study_id: id, group_id: id, revision: 0, status: "active", expires_at: 1234};
  const api = createGroupInvitationApi({
    list: async () => [{...record, invite_token: invite, password_hash: "not-public"}],
    create: async (...args) => {calls.push(args); return {...record, invite_token: invite, contact: good.email};},
    revoke: async (...args) => {calls.push(args); return {...record, revision: 1, status: "revoked", invite_token: invite};}
  }, {assert: (token, csrf) => {if (csrf !== "csrf") throw Error("csrf");}});
  for (const input of [{expires_at: "1234"}, {expires_at: -1}, {expires_at: NaN}, {expires_at: 1.5}, {expires_at: Number.MAX_SAFE_INTEGER+1},
    {expires_at: 1234, role: "superadministrator"}, {expires_at: 1234, invite_token: invite}, {expires_at: 1234, study_id: id}])
    assert.throws(() => api.create("session", id, id, input, "csrf"), invalid);
  for (const expected_revision of [-1, "0", 2147483647, 1.5, null])
    assert.throws(() => api.revoke("session", id, id, id, {expected_revision}, "csrf"), invalid);
  assert.throws(() => api.revoke("session", id, id, id, {expected_revision: 0, group_id: id}, "csrf"), invalid);
  assert.throws(() => api.create("session", id, id, {expires_at: 1234}, "wrong"), /csrf/);
  assert.throws(() => api.create("session", "other", id, {expires_at: 1234}, "csrf"), unavailable);
  assert.equal(calls.length, 0);
  assert.deepEqual(await api.list("session", id, id), [{...record, invite_token: invite}]);
  assert.deepEqual(await api.create("session", id, id, {expires_at: 1234}, "csrf"), {...record, invite_token: invite});
  assert.deepEqual(await api.revoke("session", id, id, id, {expected_revision: 0}, "csrf"), {...record, revision: 1, status: "revoked"});
  assert.deepEqual(calls, [["session", id, id, {expires_at: 1234}], ["session", id, id, id, {expected_revision: 0}]]);
});
