import type {LoginSession} from "./identity.js";
export interface PendingStaffLogin {challenge: string; expiresAt: number; status: "mfa_required"}
export interface StaffPasswordGateway {password(input: unknown): Promise<PendingStaffLogin>}
export interface StaffMfaGateway extends StaffPasswordGateway {
  enroll(challenge: string): Promise<{secret: string; issuer: string; account: string}>;
  verify(challenge: string, input: unknown): Promise<LoginSession & {recoveryCodes?: string[]}>;
  logout(token: string, csrf: string): Promise<void>;
}
