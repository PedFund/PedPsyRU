import type {LoginSession} from "./identity.js";

// Trusted, current server snapshots. None of these objects is an HTTP capability.
export interface GroupInvitationScope {
  readonly studyId: string;
  readonly groupId: string;
  readonly datasetKind: "demo";
  readonly studyStatus: "draft" | "active" | "closed";
  readonly groupStatus: "active" | "closed";
}
export interface RegistrationScope extends GroupInvitationScope {readonly contactNoticeVersion: string}
export interface GroupInvitationSnapshot {
  readonly purpose: "group_join";
  readonly id: string;
  readonly studyId: string;
  readonly groupId: string;
  readonly revision: number;
  readonly status: "active" | "revoked";
  readonly expiresAt: number;
}
export interface EmailConfirmationSnapshot {
  readonly purpose: "email_confirmation";
  readonly id: string;
  readonly invitationId: string;
  readonly invitationRevision: number;
  readonly studyId: string;
  readonly groupId: string;
  readonly contactNoticeVersion: string;
  readonly status: "pending" | "confirmed" | "cancelled";
  readonly expiresAt: number;
  readonly attemptsRemaining: number;
}

export type ConsentPurpose = "contact_processing" | "study_participation" | "secondary_research";
export interface ConsentVersion {
  readonly purpose: ConsentPurpose;
  readonly version: string;
}
export interface EnrollmentBasis {
  readonly studyId: string;
  readonly groupId: string;
  readonly participantId: string;
  readonly participantStatus: "active" | "excluded";
  readonly contactConfirmed: boolean;
  readonly passportVersion: string;
  readonly consentVersions: readonly ConsentVersion[];
}
export interface EnrollmentRequirements {
  readonly scope: RegistrationScope;
  // Explicit server availability, never inferred from a client stage number or
  // the constructor's active flag. Opening/calendar policy is a separate gate.
  readonly availableStageIds: readonly string[];
  readonly passportVersion: string;
  readonly requiredConsents: readonly ConsentVersion[];
}

export interface GroupInvitationRecord {
  readonly id: string;
  readonly study_id: string;
  readonly group_id: string;
  readonly revision: number;
  readonly status: "active" | "revoked";
  readonly expires_at: number;
  readonly token_hash?: string;
  readonly invite_token?: string;
}
// Opaque join token is shown to the owning researcher while the invitation is
// active. The database stores only its digest; the adapter re-derives a
// deterministic token from the digest for display.
export interface CreatedGroupInvitation extends GroupInvitationRecord {readonly invite_token: string}
export interface GroupInvitations {
  list(token: string, studyId: string, groupId: string): Promise<GroupInvitationRecord[]>;
  create(token: string, studyId: string, groupId: string, input: {expires_at: number}): Promise<CreatedGroupInvitation>;
  revoke(token: string, studyId: string, groupId: string, invitationId: string,
    input: {expected_revision: number}): Promise<GroupInvitationRecord>;
}
export interface RegistrationLanding {
  readonly study_title: string;
  readonly group_name: string;
  readonly contact_notice: {readonly version: string; readonly text: string; readonly legal_status: "synthetic_only"};
}
export interface RegistrationStart {
  readonly email: string;
  readonly password: string;
  readonly contact_notice_version: string;
  readonly accept_contact_notice: true;
}
export interface RegistrationConfirmation {readonly confirmation_token: string}
export interface ParticipantEmailLogin {readonly study_id: string; readonly email: string; readonly password: string}
export interface ParticipantRegistration {
  landing(inviteToken: string): Promise<RegistrationLanding>;
  // Same response for a new or already-known mailbox. Recheck current scope
  // under DB locks, bind pending registration to browser/CSRF, and queue mail.
  start(inviteToken: string, input: RegistrationStart, pendingToken: string): Promise<{status: "confirmation_requested"}>;
  // Explicit POST only; no participation/session on GET or token preview.
  // Existing mailbox MUST NOT get a new password from a registration attempt.
  confirm(inviteToken: string, input: RegistrationConfirmation, pendingToken: string): Promise<{status: "sign_in_required"}>;
  login(input: ParticipantEmailLogin): Promise<LoginSession>;
}

// Delivery receives only a purpose-bound contact confirmation, never clinical
// values, passport fields, plaintext passwords or a diagnostic participant DTO.
// The future durable outbox handles retries separately from SQL transactions.
export interface ContactConfirmationMail {
  readonly purpose: "email_confirmation";
  readonly delivery_id: string;
  readonly recipient: string;
  readonly confirmation_token: string;
  readonly expires_at: number;
}
export interface ContactDelivery {send(message: ContactConfirmationMail): Promise<void>}
