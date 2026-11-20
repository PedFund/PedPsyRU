import {ParticipationError} from "../ports/errors.js";
import type {GroupInvitations, ParticipantRegistration, RegistrationStart, RegistrationConfirmation,
  ParticipantEmailLogin, GroupInvitationRecord, RegistrationResend} from "../ports/participant-registration.js";
import {studyId} from "./study-api.js";
import {participantEmail} from "../ports/contact-email.js";
import {weakNewPassword} from "../ports/password-policy.js";
export {participantEmail} from "../ports/contact-email.js";

const invalid = (): never => {throw new ParticipationError(400, "INVALID_REGISTRATION_INPUT");};
function object(input: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input) ||
    Object.keys(input).sort().join(",") !== keys.slice().sort().join(",")) invalid();
  return input as Record<string, unknown>;
}
function version(input: unknown): string {
  if (typeof input !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(input)) invalid();
  return input as string;
}
export function registrationToken(input: unknown): string {
  if (typeof input !== "string" || !/^[a-zA-Z0-9_-]{43}$/.test(input))
    throw new ParticipationError(404, "NOT_AVAILABLE");
  return input as string;
}
function password(input: unknown): string {
  // Existing scrypt size bounds: >=12 code units, <=256 UTF-8 bytes.
  // A pure count avoids importing Buffer/runtime modules. Never trim passwords.
  if (typeof input !== "string" || input.length < 12 || input.length > 256 || /[\u0000-\u001f\u007f]/.test(input)) invalid();
  const bytes = Array.from(input as string).reduce((total, ch) => {
    const cp = ch.codePointAt(0) ?? 0;
    return total + (cp < 128 ? 1 : cp < 2048 ? 2 : cp < 65536 ? 3 : 4);
  }, 0);
  if (bytes > 256) invalid();
  return input as string;
}
export function registrationStart(input: unknown): RegistrationStart {
  const b = object(input, ["email", "password", "contact_notice_version", "accept_contact_notice"]);
  if (b.accept_contact_notice !== true) invalid();
  // New passwords only: a common password or one that repeats the login email is
  // refused. Login keeps accepting existing passwords through password().
  const email = participantEmail(b.email), secret = password(b.password);
  if (weakNewPassword(secret, [email])) throw new ParticipationError(400, "WEAK_PASSWORD");
  return {email, password: secret,
    contact_notice_version: version(b.contact_notice_version), accept_contact_notice: true};
}
export function registrationConfirmation(input: unknown): RegistrationConfirmation {
  const b = object(input, ["confirmation_token"]);
  return {confirmation_token: registrationToken(b.confirmation_token)};
}
export function registrationResend(input: unknown): RegistrationResend {
  const b = object(input, ["email"]);
  return {email: participantEmail(b.email)};
}
export function participantEmailLogin(input: unknown): ParticipantEmailLogin {
  // Without a study link the server resolves the study from the address when it
  // belongs to exactly one active study; the field is therefore optional.
  if (!input || typeof input !== "object" || Array.isArray(input)) invalid();
  const b = input as Record<string, unknown>, keys = Object.keys(b).sort().join(",");
  if (keys !== "email,password" && keys !== "email,password,study_id") invalid();
  return {...(b.study_id === undefined ? {} : {study_id: studyId(b.study_id)}),
    email: participantEmail(b.email), password: password(b.password)};
}

interface MutationProtection {assert(token: string, csrf: string): void}
// HTTP must also enforce same-origin/POST, request caps, neutral errors and
// rate limits. This application boundary is deliberately not wired to runtime.
export function createParticipantRegistrationApi(registration: ParticipantRegistration, protection: MutationProtection) {
  return {
    landing: async (invite: string) => {
      const dto = await registration.landing(registrationToken(invite));
      return {study_title: dto.study_title, group_name: dto.group_name,
        contact_notice: {version: dto.contact_notice.version, text: dto.contact_notice.text, legal_status: "synthetic_only" as const}};
    },
    start: (invite: string, input: unknown, pendingToken: string, csrf: string) => {
      protection.assert(pendingToken, csrf);
      return registration.start(registrationToken(invite), registrationStart(input), registrationToken(pendingToken))
        .then(() => ({status: "confirmation_requested" as const}));
    },
    confirm: (invite: string, input: unknown, pendingToken: string, csrf: string) => {
      protection.assert(pendingToken, csrf);
      return registration.confirm(registrationToken(invite), registrationConfirmation(input), registrationToken(pendingToken))
        .then(() => ({status: "sign_in_required" as const}));
    },
    // Repeat delivery deliberately does not depend on the pending browser cookie:
    // a reloaded page or a phone must be able to ask for the code again.
    resend: (invite: string, input: unknown) =>
      registration.resend(registrationToken(invite), registrationResend(input))
        .then(() => ({status: "accepted" as const})),
    login: async (input: unknown) => {
      const session = await registration.login(participantEmailLogin(input));
      return {token: session.token, csrf: session.csrf, expiresAt: session.expiresAt};
    }
  };
}
function invitationRecord(dto: GroupInvitationRecord): GroupInvitationRecord {
  return {id: dto.id, study_id: dto.study_id, group_id: dto.group_id, revision: dto.revision,
    status: dto.status, expires_at: dto.expires_at, ...(dto.invite_token ? {invite_token: dto.invite_token} : {})};
}
export function createGroupInvitationApi(invitations: GroupInvitations, protection: MutationProtection) {
  return {
    list: async (token: string, study: string, group: string) =>
      (await invitations.list(token, studyId(study), studyId(group))).map(invitationRecord),
    create: (token: string, study: string, group: string, input: unknown, csrf: string) => {
      protection.assert(token, csrf);
      const b = object(input, ["expires_at"]);
      if (!Number.isSafeInteger(b.expires_at) || Number(b.expires_at) < 0) invalid();
      return invitations.create(token, studyId(study), studyId(group), {expires_at: Number(b.expires_at)})
        .then(dto => ({...invitationRecord(dto), invite_token: dto.invite_token}));
    },
    revoke: (token: string, study: string, group: string, inviteId: string, input: unknown, csrf: string) => {
      protection.assert(token, csrf);
      const b = object(input, ["expected_revision"]);
      if (!Number.isInteger(b.expected_revision) || Number(b.expected_revision) < 0 || Number(b.expected_revision) > 2147483646) invalid();
      return invitations.revoke(token, studyId(study), studyId(group), studyId(inviteId), {expected_revision: Number(b.expected_revision)})
        .then(dto => {const {invite_token, ...record} = invitationRecord(dto); return record;});
    }
  };
}
