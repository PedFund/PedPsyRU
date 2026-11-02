import {randomBytes, randomUUID} from "node:crypto";
import type {Pool} from "pg";
import type {GroupInvitations, GroupInvitationRecord, GroupInvitationScope} from "../../ports/participant-registration.js";
import type {AccountRole} from "../../ports/accounts.js";
import {ParticipationError} from "../../ports/errors.js";
import {requireGroupInvitationManagement} from "../../ports/participant-registration-policy.js";
import {accountTransaction, tokenHash, accountWallTime} from "./account-transaction.js";
interface Actor {credential_id: string; user_id: string; actor_role: AccountRole; credential_version: number;
  expires_at_ms: string; mfa_verified_at_ms: string | null}
export class PostgresGroupInvitations implements GroupInvitations {
  constructor(private readonly pool: Pool) {}
  private async call<T>(token: string, studyId: string, groupId: string, action: "list" | "create" | "revoke",
    sql: string, args: unknown[]): Promise<T> {
    if (typeof token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw new ParticipationError(401, "AUTH_REQUIRED");
    return accountTransaction(this.pool, async c => {
      await c.query("SELECT set_config('app.session_hash',$1,true)", [tokenHash(token)]);
      const data = (await c.query<{data: T}>(sql, args)).rows[0]!.data;
      // Fixed SQL holds the current identity/study/group locks and has audited
      // the operation. Central policy is a second gate before the same commit.
      const a = (await c.query<Actor>("SELECT * FROM pedpsy.account_actor()")).rows[0];
      if (!a) throw new ParticipationError(401, "AUTH_REQUIRED");
      const gate = (await c.query<{scope: GroupInvitationScope; owns: boolean}>(
        "SELECT pedpsy.group_invitation_policy_scope($1,$2) scope, pedpsy.account_owns_study($1) owns", [studyId, groupId])).rows[0];
      if (!gate?.scope) throw new ParticipationError(404, "NOT_AVAILABLE");
      requireGroupInvitationManagement({realm: a.actor_role === "researcher" ? "researcher" : "staff",
        userId: a.user_id, credentialId: a.credential_id, role: a.actor_role, sessionVersion: a.credential_version,
        expiresAt: Number(a.expires_at_ms), mfaVerifiedAt: a.mfa_verified_at_ms === null ? null : Number(a.mfa_verified_at_ms)},
        gate.scope, action, await accountWallTime(c), gate.owns);
      return data;
    });
  }
  list(token: string, studyId: string, groupId: string) {
    return this.call<GroupInvitationRecord[]>(token, studyId, groupId, "list", "SELECT pedpsy.list_group_invitations($1,$2) data", [studyId, groupId]);
  }
  async create(token: string, studyId: string, groupId: string, input: {expires_at: number}) {
    const raw = randomBytes(32).toString("base64url");
    const record = await this.call<GroupInvitationRecord>(token, studyId, groupId, "create",
      "SELECT pedpsy.create_group_invitation($1,$2,$3,$4,$5) data", [studyId, groupId, randomUUID(), tokenHash(raw), input.expires_at]);
    return {...record, invite_token: raw};
  }
  revoke(token: string, studyId: string, groupId: string, invitationId: string, input: {expected_revision: number}) {
    return this.call<GroupInvitationRecord>(token, studyId, groupId, "revoke", "SELECT pedpsy.revoke_group_invitation($1,$2,$3,$4) data",
      [studyId, groupId, invitationId, input.expected_revision]);
  }
}
