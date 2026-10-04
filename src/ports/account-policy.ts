import {ACCOUNT_OPERATIONS} from "./accounts.js";
import type {AccountOperation, AccountPrincipal, AccountResource} from "./accounts.js";
import {ParticipationError} from "./errors.js";
export const FRESH_MFA_MS = 300000;
const researcher = new Set<AccountOperation>(["account.read", "studies.read", "studies.configure", "aggregates.read"]);
const administrator = new Set<AccountOperation>(["account.read", "studies.read", "studies.configure", "aggregates.read", "researchers.read", "researchers.invite", "researchers.block", "protocols.read", "protocols.download", "results.read", "results.download"]);
const superadministrator = new Set<AccountOperation>([...administrator, "staff.roles.assign", "methods.manage", "processing.manage"]);
const sensitive = new Set<AccountOperation>(["studies.configure", "researchers.invite", "researchers.block", "staff.roles.assign", "protocols.download", "results.download", "methods.manage", "processing.manage"]);
// Pure policy evaluation only. Authentication, current membership lookup, locks
// and mandatory audit remain responsibilities of the trusted server adapter.
export function requireAccountPermission(principal: AccountPrincipal, operation: AccountOperation, resource: AccountResource,
  now: number, ownsStudy: boolean): void {
  if (!Number.isSafeInteger(now) || !principal || !Number.isSafeInteger(principal.sessionVersion) || principal.sessionVersion < 1 ||
    !Number.isSafeInteger(principal.expiresAt) || now >= principal.expiresAt ||
    principal.role === "researcher" && principal.realm !== "researcher" ||
    principal.role !== "researcher" && principal.realm !== "staff") throw new ParticipationError(401, "AUTH_REQUIRED");
  if (!ACCOUNT_OPERATIONS.includes(operation)) throw new ParticipationError(403, "FORBIDDEN");
  const allowed = principal.role === "researcher" ? researcher : principal.role === "administrator" ? administrator :
    principal.role === "superadministrator" ? superadministrator : new Set<AccountOperation>();
  if (!allowed.has(operation)) throw new ParticipationError(403, "FORBIDDEN");
  if (principal.realm === "staff") {
    if (!Number.isSafeInteger(principal.mfaVerifiedAt) || principal.mfaVerifiedAt === null || principal.mfaVerifiedAt > now)
      throw new ParticipationError(401, "AUTH_REQUIRED");
    if (sensitive.has(operation) && now - principal.mfaVerifiedAt >= FRESH_MFA_MS) throw new ParticipationError(403, "MFA_RECHECK_REQUIRED");
  } else if (operation !== "account.read" && (!resource.studyId || !ownsStudy)) throw new ParticipationError(404, "NOT_AVAILABLE");
}
