import type {Pool,PoolClient} from "pg";
import type {AccountOperation,AccountRole} from "../../ports/accounts.js";
import {requireAccountPermission} from "../../ports/account-policy.js";
import {ParticipationError} from "../../ports/errors.js";
import {accountTransaction,tokenHash} from "./account-transaction.js";
interface Row{credential_id:string;user_id:string;actor_role:AccountRole;credential_version:number;expires_at_ms:string;mfa_verified_at_ms:string|null}
export async function withStaffOperation<T>(pool:Pool,token:string,operation:AccountOperation,callback:(client:PoolClient)=>Promise<T>):Promise<T>{
  if(!/^[A-Za-z0-9_-]{43}$/.test(token))throw new ParticipationError(401,"AUTH_REQUIRED");
  return accountTransaction(pool,async c=>{
    await c.query("SELECT set_config('app.session_hash',$1,true)",[tokenHash(token)]);await c.query("SELECT * FROM pedpsy.lock_staff_operation($1)",[operation]);
    const a=(await c.query<Row>("SELECT * FROM pedpsy.account_actor()")).rows[0];if(!a)throw new ParticipationError(401,"AUTH_REQUIRED");
    requireAccountPermission({realm:"staff",userId:a.user_id,credentialId:a.credential_id,role:a.actor_role,sessionVersion:a.credential_version,
      expiresAt:Number(a.expires_at_ms),mfaVerifiedAt:a.mfa_verified_at_ms===null?null:Number(a.mfa_verified_at_ms)},operation,{},Date.now(),false);
    return callback(c);
  });
}
