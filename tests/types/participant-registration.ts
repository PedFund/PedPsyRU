import type {GroupInvitationSnapshot, EmailConfirmationSnapshot, RegistrationStart,
  EnrollmentRequirements, ContactConfirmationMail} from "../../src/ports/participant-registration.js";
export const groupInvite: GroupInvitationSnapshot = {purpose: "group_join", id: "synthetic", studyId: "synthetic",
  groupId: "synthetic", revision: 0, status: "active", expiresAt: 1000};
// @ts-expect-error A shared link is not a one-use mailbox confirmation.
export const confirmationFromSharedLink: EmailConfirmationSnapshot = groupInvite;
// @ts-expect-error Confirmation is not a staff role or a login session.
export const administrativeInvite: GroupInvitationSnapshot = {...groupInvite, purpose: "staff_login"};
// @ts-expect-error Client registration cannot assign its own study/group/role.
export const massAssignment: RegistrationStart = {email: "a@example.test", password: "synthetic password", contact_notice_version: "demo-1", accept_contact_notice: true, group_id: "other"};
// @ts-expect-error Consent must be explicit, not a coerced checkbox value.
export const implicitConsent: RegistrationStart = {email: "a@example.test", password: "synthetic password", contact_notice_version: "demo-1", accept_contact_notice: false};
// @ts-expect-error Real datasets are not enabled by this synthetic gate.
export const realScope: EnrollmentRequirements["scope"] = {studyId: "synthetic", groupId: "synthetic", datasetKind: "real", studyStatus: "active", groupStatus: "active", contactNoticeVersion: "demo-1"};
// @ts-expect-error Diagnostic results do not belong to a confirmation email.
export const diagnosticEmail: ContactConfirmationMail = {purpose: "email_confirmation", delivery_id: "synthetic", recipient: "a@example.test", confirmation_token: "synthetic", expires_at: 1000, results: [12]};
