import type {Pool} from "pg";
import type {PassportSchemas,PassportSchema,PassportSchemaInput} from "../../ports/passport-schema.js";
import {ParticipationError} from "../../ports/errors.js";
import {requireAccountPermission} from "../../ports/account-policy.js";
import type {AccountRole,AccountOperation} from "../../ports/accounts.js";
import {accountTransaction,tokenHash} from "./account-transaction.js";
interface Actor{credential_id:string;user_id:string;actor_role:AccountRole;credential_version:number;expires_at_ms:string;mfa_verified_at_ms:string|null}
export class PostgresPassportSchemas implements PassportSchemas {
  constructor(private readonly pool:Pool){}
  private async call(token:string,study:string,operation:AccountOperation,sql:string,args:unknown[]):Promise<PassportSchema>{
    if(!/^[A-Za-z0-9_-]{43}$/.test(token))throw new ParticipationError(401,"AUTH_REQUIRED");
    return accountTransaction(this.pool,async c=>{
      await c.query("SELECT set_config('app.session_hash',$1,true)",[tokenHash(token)]);
      const data=(await c.query<{data:PassportSchema}>(sql,args)).rows[0]!.data;
      // Reuse the constructor's central commit gate; fixed SQL rechecks the
      // current owner/staff under the same locks before changing metadata.
      const a=(await c.query<Actor>("SELECT * FROM pedpsy.account_actor()")).rows[0];if(!a)throw new ParticipationError(401,"AUTH_REQUIRED");
      const own=(await c.query<{own:boolean}>("SELECT pedpsy.account_owns_study($1) own",[study])).rows[0]!.own;
      requireAccountPermission({realm:a.actor_role==="researcher"?"researcher":"staff",userId:a.user_id,credentialId:a.credential_id,role:a.actor_role,sessionVersion:a.credential_version,
        expiresAt:Number(a.expires_at_ms),mfaVerifiedAt:a.mfa_verified_at_ms===null?null:Number(a.mfa_verified_at_ms)},operation,{studyId:study},Date.now(),own);
      return data;
    });
  }
  read(token:string,study:string){return this.call(token,study,"studies.read","SELECT pedpsy.read_passport_schema($1) data",[study]);}
  configure(token:string,study:string,input:PassportSchemaInput){
    return this.call(token,study,"studies.configure","SELECT pedpsy.configure_passport_schema($1,$2,$3,$4::jsonb,$5::jsonb) data",[study,input.expected_version,input.expected_schema_version,JSON.stringify(input.basic_required),JSON.stringify(input.additional_fields)]);
  }
}
