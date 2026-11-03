import {createHash} from "node:crypto";
import type {Pool} from "pg";
import type {AccountAccess,AccountOperation,AccountPrincipal,AccountResource,AccountRole,AccountSession} from "../../ports/accounts.js";
import {requireAccountPermission} from "../../ports/account-policy.js";
import {ParticipationError} from "../../ports/errors.js";
import {assertRuntimeClient,mapPostgresError} from "./unit-of-work.js";
import {accountTransaction,tokenHash,accountWallTime} from "./account-transaction.js";
interface ActorRow {credential_id:string;user_id:string;actor_role:AccountRole;credential_version:number;expires_at_ms:string;mfa_verified_at_ms:string|null}
export class PostgresAccountAccess implements AccountAccess {
  constructor(private readonly pool:Pool) {}
  private async inspect(token:string,operation:AccountOperation,resource:AccountResource):Promise<AccountSession> {
    const client=await this.pool.connect();
    try {
      await assertRuntimeClient(client);await client.query("BEGIN");
      try {
        await client.query("SELECT set_config('statement_timeout','5000',true),set_config('lock_timeout','3000',true),set_config('idle_in_transaction_session_timeout','10000',true),set_config('app.session_hash',$1,true)",
          [/^[A-Za-z0-9_-]{43}$/.test(token)?"sha256:"+createHash("sha256").update(token).digest("hex"):""]);
        const row=(await client.query<ActorRow>("SELECT * FROM pedpsy.account_actor()")).rows[0];
        let principal:AccountPrincipal|null=null,error:ParticipationError|null=null;
        try {
          if(!row)throw new ParticipationError(401,"AUTH_REQUIRED");
          principal={realm:row.actor_role==="researcher"?"researcher":"staff",userId:row.user_id,credentialId:row.credential_id,role:row.actor_role,
            sessionVersion:row.credential_version,expiresAt:Number(row.expires_at_ms),mfaVerifiedAt:row.mfa_verified_at_ms===null?null:Number(row.mfa_verified_at_ms)};
          const study=resource.studyId;
          const owns=typeof study==="string" && /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(study)?
            Boolean((await client.query<{allowed:boolean}>("SELECT pedpsy.account_owns_study($1) allowed",[study])).rows[0]?.allowed):false;
          requireAccountPermission(principal,operation,resource,await accountWallTime(client),owns);
        }catch(e){if(!(e instanceof ParticipationError))throw e;error=e;}
        await client.query("SELECT pedpsy.record_account_check($1,$2,$3)",[operation,!error,error?.code??"CURRENT_POLICY"]);
        await client.query("COMMIT");
        if(error)throw error;
        if(!principal)throw new ParticipationError(401,"AUTH_REQUIRED");
        return {user_id:principal.userId,role:principal.role,session_version:principal.sessionVersion,expires_at:principal.expiresAt};
      }catch(e){await client.query("ROLLBACK");throw e;}
    }catch(e){throw mapPostgresError(e);}finally{client.release();}
  }
  session(token:string):Promise<AccountSession>{return this.inspect(token,"account.read",{});}
  async denied(token:string,reason:string):Promise<void>{await accountTransaction(this.pool,async c=>{
    await c.query("SELECT set_config('app.session_hash',$1,true)",[/^[A-Za-z0-9_-]{43}$/.test(token)?tokenHash(token):""]);
    await c.query("SELECT pedpsy.record_account_check('http_denied',false,$1)",[reason]);
  });}
  async check(token:string,operation:AccountOperation,resource:AccountResource={}):Promise<void>{await this.inspect(token,operation,resource);}
}
