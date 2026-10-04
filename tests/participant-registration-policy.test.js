"use strict";
const {test} = require("node:test"), assert = require("node:assert/strict");
const {requireGroupInvitationManagement, requireJoinInvitation, requireEmailConfirmation,
  requireParticipantEnrollment} = require("../dist/src/ports/participant-registration-policy.js");
const now = 1000;
const scope = {studyId: "study-one", groupId: "group-one", datasetKind: "demo", studyStatus: "active",
  groupStatus: "active", contactNoticeVersion: "contact-1"};
const principal = {realm: "researcher", role: "researcher", userId: "researcher-one", credentialId: "credential-one",
  sessionVersion: 1, expiresAt: 2000, mfaVerifiedAt: null};
const invite = {purpose: "group_join", id: "invite-one", studyId: scope.studyId, groupId: scope.groupId,
  status: "active", revision: 0, expiresAt: 1500};
const pending = {purpose: "email_confirmation", id: "registration-one", invitationId: invite.id,
  invitationRevision: invite.revision, studyId: scope.studyId, groupId: scope.groupId,
  contactNoticeVersion: scope.contactNoticeVersion, status: "pending", expiresAt: 1400, attemptsRemaining: 3};
const consents = [{purpose: "contact_processing", version: "contact-1"}, {purpose: "study_participation", version: "participation-1"}];
const basis = {studyId: scope.studyId, groupId: scope.groupId, participantId: "participant-one",
  participantStatus: "active", contactConfirmed: true, passportVersion: "passport-1", consentVersions: consents};
const requirements = {scope, availableStageIds: ["stage-T1"], passportVersion: "passport-1", requiredConsents: consents};
const unavailable = e => e.status === 404 && e.code === "NOT_AVAILABLE";
const changed = e => e.status === 409 && e.code === "PARTICIPATION_REQUIREMENTS_CHANGED";

test("only a current owning researcher manages group invitations; no new staff editing right", () => {
  requireGroupInvitationManagement(principal, scope, "create", now, true);
  assert.throws(() => requireGroupInvitationManagement(principal, scope, "create", now, false), unavailable);
  for (const role of ["administrator", "superadministrator"]) {
    assert.throws(() => requireGroupInvitationManagement({...principal, realm: "staff", role, mfaVerifiedAt: now}, scope, "create", now, true),
      e => e.status === 403 && e.code === "FORBIDDEN");
  }
});
test("invitation management does not accept expired, wrong realm or malformed principal", () => {
  for (const update of [{expiresAt: now}, {sessionVersion: 0}, {sessionVersion: 1.5}, {realm: "staff"}, {role: "participant"}])
    assert.throws(() => requireGroupInvitationManagement({...principal, ...update}, scope, "create", now, true), e => [401,403].includes(e.status));
  for (const time of [NaN, Infinity, -1, 1.5]) assert.throws(() => requireGroupInvitationManagement(principal, scope, "create", time, true));
});
test("closed resources forbid creation but do not prevent their owner revoking an invitation", () => {
  for (const update of [{studyStatus: "draft"}, {studyStatus: "closed"}, {groupStatus: "closed"}]) {
    const s = {...scope, ...update};
    assert.throws(() => requireGroupInvitationManagement(principal, s, "create", now, true), unavailable);
    requireGroupInvitationManagement(principal, s, "revoke", now, true);
  }
  for (const update of [{datasetKind: "real"}, {groupId: ""}, {studyStatus: "published"}])
    assert.throws(() => requireGroupInvitationManagement(principal, {...scope, ...update}, "revoke", now, true), unavailable);
  assert.throws(() => requireGroupInvitationManagement(principal, scope, "change_owner", now, true), unavailable);
});
test("shared join invitation is reusable, purpose-bound, scoped and strictly expiring", () => {
  const before = JSON.stringify(invite);
  requireJoinInvitation(invite, scope, now); requireJoinInvitation(invite, scope, now);
  assert.equal(JSON.stringify(invite), before);
  for (const update of [{purpose: "email_confirmation"}, {id: ""}, {studyId: "study-two"}, {groupId: "group-two"},
    {status: "revoked"}, {expiresAt: now}, {expiresAt: NaN}, {revision: -1}, {revision: 2147483647}, {revision: "0"}])
    assert.throws(() => requireJoinInvitation({...invite, ...update}, scope, now), unavailable);
});
test("join permission is not inherited from a draft/closed/group-closed or real dataset", () => {
  for (const update of [{studyStatus: "draft"}, {studyStatus: "closed"}, {groupStatus: "closed"}, {datasetKind: "real"}, {contactNoticeVersion: ""}])
    assert.throws(() => requireJoinInvitation(invite, {...scope, ...update}, now), unavailable);
  for (const time of [-1, NaN, Infinity, 1.2]) assert.throws(() => requireJoinInvitation(invite, scope, time), unavailable);
});
test("email confirmation rechecks invite scope, revision, purpose, notice, expiry and attempts", () => {
  requireEmailConfirmation(pending, invite, scope, now);
  for (const update of [{purpose: "group_join"}, {id: ""}, {invitationId: "another"}, {invitationRevision: 1},
    {studyId: "study-two"}, {groupId: "group-two"}, {contactNoticeVersion: "contact-0"}, {status: "confirmed"},
    {status: "cancelled"}, {expiresAt: now}, {attemptsRemaining: 0}, {attemptsRemaining: "3"}, {attemptsRemaining: 1.5}])
    assert.throws(() => requireEmailConfirmation({...pending, ...update}, invite, scope, now), unavailable);
  assert.throws(() => requireEmailConfirmation(pending, {...invite, status: "revoked"}, scope, now), unavailable);
  assert.throws(() => requireEmailConfirmation(pending, invite, {...scope, studyStatus: "closed"}, now), unavailable);
  assert.throws(() => requireEmailConfirmation(pending, {...invite, revision: 1}, scope, now), unavailable);
});
test("one-use confirmation does not mutate or turn into a reusable group bearer", () => {
  const before = JSON.stringify(pending);
  requireEmailConfirmation(Object.freeze(pending), Object.freeze(invite), Object.freeze(scope), now);
  assert.equal(JSON.stringify(pending), before);
  assert.throws(() => requireJoinInvitation(pending, scope, now), unavailable);
  // DB persistence/consume under locks is required; a pure check alone consumes nothing.
});
test("returning participant may enroll at T1 without T0 or an active recruitment invite", () => {
  const before = JSON.stringify(basis);
  requireParticipantEnrollment(basis, requirements, "stage-T1");
  requireParticipantEnrollment(basis, requirements, "stage-T1");
  assert.equal(JSON.stringify(basis), before);
  // Enrollment input has no invitation dependency: recruiting revoke is not exclusion.
});
test("enrollment forbids cross-study/group, excluded participant or unopened stage", () => {
  for (const update of [{participantId: ""}, {studyId: "study-two"}, {groupId: "group-two"}, {participantStatus: "excluded"}])
    assert.throws(() => requireParticipantEnrollment({...basis, ...update}, requirements, "stage-T1"), unavailable);
  for (const stage of ["", "stage-T0", "stage-of-another-group"])
    assert.throws(() => requireParticipantEnrollment(basis, requirements, stage), unavailable);
  assert.throws(() => requireParticipantEnrollment(basis, {...requirements, availableStageIds: []}, "stage-T1"), unavailable);
  assert.throws(() => requireParticipantEnrollment(basis, {...requirements, scope: {...scope, studyStatus: "closed"}}, "stage-T1"), unavailable);
});
test("contact, passport and consent versions must be current, secondary reuse remains optional", () => {
  for (const update of [{contactConfirmed: false}, {contactConfirmed: "true"}, {passportVersion: "passport-0"},
    {consentVersions: []}, {consentVersions: [consents[0]]}, {consentVersions: [{...consents[0], version: "old"}, consents[1]]},
    {consentVersions: [...consents, consents[0]]}])
    assert.throws(() => requireParticipantEnrollment({...basis, ...update}, requirements, "stage-T1"), changed);
  requireParticipantEnrollment({...basis, consentVersions: [...consents, {purpose: "secondary_research", version: "secondary-1"}]}, requirements, "stage-T1");
  for (const requiredConsents of [[], [consents[0]], [...consents, consents[0]],
    [...consents, {purpose: "secondary_research", version: "secondary-1"}], [...consents, {purpose: "unknown", version: "x"}]])
    assert.throws(() => requireParticipantEnrollment(basis, {...requirements, requiredConsents}, "stage-T1"), changed);
  assert.throws(() => requireParticipantEnrollment(basis, {...requirements, scope: {...scope, contactNoticeVersion: "contact-2"}}, "stage-T1"), changed);
});
