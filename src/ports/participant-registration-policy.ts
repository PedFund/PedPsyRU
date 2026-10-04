import type {AccountPrincipal} from "./accounts.js";
import {requireAccountPermission} from "./account-policy.js";
import {ParticipationError} from "./errors.js";
import type {GroupInvitationScope, RegistrationScope, GroupInvitationSnapshot, EmailConfirmationSnapshot,
  EnrollmentBasis, EnrollmentRequirements} from "./participant-registration.js";

const available = (): never => {throw new ParticipationError(404, "NOT_AVAILABLE");};
const clock = (now: number): boolean => Number.isSafeInteger(now) && now >= 0;
const revision = (value: number): boolean => Number.isInteger(value) && value >= 0 && value <= 2147483646;
function activeScope(scope: RegistrationScope): void {
  if (!scope.studyId || !scope.groupId || !scope.contactNoticeVersion || scope.datasetKind !== "demo" ||
    scope.studyStatus !== "active" || scope.groupStatus !== "active") available();
}

// Pure policy checks are NOT authorization for a later database mutation.
// Trusted adapters must reread/lock identity, membership, scope and versions in
// the same transaction as the write, and commit mandatory secret-free audit.
export function requireGroupInvitationManagement(principal: AccountPrincipal, scope: GroupInvitationScope,
  action: "list" | "create" | "revoke", now: number, ownsStudy: boolean): void {
  requireAccountPermission(principal, "studies.configure", {studyId: scope.studyId}, now, ownsStudy);
  if (!clock(now) || !scope.studyId || !scope.groupId || scope.datasetKind !== "demo" ||
    !["draft", "active", "closed"].includes(scope.studyStatus) || !["active", "closed"].includes(scope.groupStatus)) available();
  if (action === "create" && (scope.studyStatus !== "active" || scope.groupStatus !== "active")) available();
  else if (!["list", "create", "revoke"].includes(action)) available();
}

export function requireJoinInvitation(invite: GroupInvitationSnapshot, scope: RegistrationScope, now: number): void {
  activeScope(scope);
  if (!clock(now) || invite.purpose !== "group_join" || !invite.id || !revision(invite.revision) ||
    invite.studyId !== scope.studyId || invite.groupId !== scope.groupId || invite.status !== "active" ||
    !Number.isSafeInteger(invite.expiresAt) || now >= invite.expiresAt) available();
}

export function requireEmailConfirmation(pending: EmailConfirmationSnapshot, invite: GroupInvitationSnapshot,
  scope: RegistrationScope, now: number): void {
  requireJoinInvitation(invite, scope, now);
  if (pending.purpose !== "email_confirmation" || !pending.id || pending.status !== "pending" ||
    pending.invitationId !== invite.id || pending.invitationRevision !== invite.revision ||
    pending.studyId !== scope.studyId || pending.groupId !== scope.groupId ||
    pending.contactNoticeVersion !== scope.contactNoticeVersion ||
    !Number.isSafeInteger(pending.expiresAt) || now >= pending.expiresAt ||
    !Number.isInteger(pending.attemptsRemaining) || pending.attemptsRemaining < 1) available();
}

// Called after the participant's own authenticated identity has been resolved.
// An invite revocation blocks NEW joins, not existing enrollment/login; do not
// require a still-active invitation here. Contact/consent/passport remain gates.
export function requireParticipantEnrollment(basis: EnrollmentBasis, requirements: EnrollmentRequirements, stageId: string): void {
  const scope = requirements.scope;
  activeScope(scope);
  if (!basis.participantId || basis.studyId !== scope.studyId || basis.groupId !== scope.groupId ||
    basis.participantStatus !== "active" || !stageId || !requirements.availableStageIds.includes(stageId)) available();
  const required = requirements.requiredConsents;
  if (basis.contactConfirmed !== true || !requirements.passportVersion || basis.passportVersion !== requirements.passportVersion ||
    !required.some(c => c.purpose === "contact_processing" && c.version === scope.contactNoticeVersion) ||
    !required.some(c => c.purpose === "study_participation" && c.version.length > 0) ||
    required.some(c => !["contact_processing", "study_participation"].includes(c.purpose) || !c.version) ||
    new Set(required.map(c => c.purpose)).size !== required.length ||
    new Set(basis.consentVersions.map(c => c.purpose)).size !== basis.consentVersions.length ||
    required.some(c => !basis.consentVersions.some(a => a.purpose === c.purpose && a.version === c.version)))
    throw new ParticipationError(409, "PARTICIPATION_REQUIREMENTS_CHANGED");
}
