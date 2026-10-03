// Internal verified snapshots, not HTTP DTOs or bearer capabilities.
export type AccountRole = "researcher" | "administrator" | "superadministrator";
export interface AccountPrincipal {
  readonly realm: "researcher" | "staff";
  readonly userId: string;
  readonly credentialId: string;
  readonly role: AccountRole;
  readonly sessionVersion: number;
  readonly expiresAt: number;
  readonly mfaVerifiedAt: number | null;
}
export const ACCOUNT_OPERATIONS = ["account.read", "studies.read", "studies.configure", "aggregates.read",
  "researchers.read", "researchers.invite", "researchers.block", "staff.roles.assign",
  "protocols.read", "protocols.download", "results.read", "results.download", "methods.manage", "processing.manage"] as const;
export type AccountOperation = typeof ACCOUNT_OPERATIONS[number];
export interface AccountResource {readonly studyId?: string}
export interface AccountSession {readonly user_id: string; readonly role: AccountRole; readonly session_version: number; readonly expires_at: number}
export interface AccountAccess {
  session(token: string): Promise<AccountSession>;
  // Checks current policy only; not a capability to execute a later mutation.
  // Mutations must recheck identity/policy under their own transaction locks.
  check(token: string, operation: AccountOperation, resource?: AccountResource): Promise<void>;
}
