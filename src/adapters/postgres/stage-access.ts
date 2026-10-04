import type {Pool} from "pg";
import type {GroupStageAccess,StageAccess} from "../../ports/stage-access.js";
import type {AccountRole} from "../../ports/accounts.js";
import {requireAccountPermission} from "../../ports/account-policy.js";
import {ParticipationError} from "../../ports/errors.js";
import {accountTransaction,tokenHash} from "./account-transaction.js";
interface Actor{credential_id:string;user_id:string;actor_role:AccountRole;credential_version:number;expires_at_ms:string;mfa_verified_at_ms:string|null}
export class PostgresStageAccess implements StageAccess {
  constructor(private readonly pool:Pool){}
  private async call<T>(token:string,study:string,write:boolean,sql:string,args:unknown[]):Promise<T>{
    if(typeof token!=="string"||!/^[A-Za-z0-9_-]{43}$/.test(token))throw new ParticipationError(401,"AUTH_REQUIRED");
    return accountTransaction(this.pool,async c=>{
      await c.query("SELECT set_config('app.session_hash',$1,true)",[tokenHash(token)]);
      const data=(await c.query<{data:T}>(sql,args)).rows[0]!.data;
      const a=(await c.query<Actor>("SELECT * FROM pedpsy.account_actor()")).rows[0];if(!a)throw new ParticipationError(401,"AUTH_REQUIRED");
      const own=(await c.query<{own:boolean}>("SELECT pedpsy.account_owns_study($1) own",[study])).rows[0]!.own;
      // Fixed SQL repeats scope under current locks and audits before this same
      // transaction's central commit gate; no client role or cached membership.
      requireAccountPermission({realm:a.actor_role==="researcher"?"researcher":"staff",role:a.actor_role,userId:a.user_id,
        credentialId:a.credential_id,sessionVersion:a.credential_version,expiresAt:Number(a.expires_at_ms),
        mfaVerifiedAt:a.mfa_verified_at_ms===null?null:Number(a.mfa_verified_at_ms)},write?"studies.configure":"studies.read",{studyId:study},Date.now(),own);
      return data;
    });
  }
  list(token:string,study:string,group:string){return this.call<GroupStageAccess[]>(token,study,false,"SELECT pedpsy.list_group_stage_access($1,$2) data",[study,group]);}
  open(token:string,study:string,group:string,stage:string,input:{expected_revision:0|1}){
    return this.call<GroupStageAccess>(token,study,true,"SELECT pedpsy.open_group_stage($1,$2,$3,$4) data",[study,group,stage,input.expected_revision]);
  }
}
