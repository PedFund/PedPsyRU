import type {Pool} from "pg";
import type {MethodLibrary,PreparedMethodDraft,MethodLibraryRecord,CatalogMethod,PlanningMethod,MethodTransferStatus} from "../../ports/method-library.js";
import {ParticipationError} from "../../ports/errors.js";
import {accountTransaction,tokenHash,accountWallTime} from "./account-transaction.js";
import {requireAccountPermission} from "../../ports/account-policy.js";
import type {AccountRole} from "../../ports/accounts.js";
export function methodDraftSqlInput(draft:PreparedMethodDraft){
  const v=draft.verification,p=v.package;
  return [JSON.stringify(p),v.evidence.package_digest,JSON.stringify({handler:v.handler,blockers:v.blockers}),JSON.stringify(draft.artifacts.map(a=>({id:a.id,path:a.path,base64:Buffer.from(a.bytes).toString("base64")})))];
}
interface Actor{credential_id:string;user_id:string;actor_role:AccountRole;credential_version:number;expires_at_ms:string;mfa_verified_at_ms:string|null}
export class PostgresMethodLibrary implements MethodLibrary{
  constructor(private readonly pool:Pool){}
  private async call<T>(token:string,sql:string,args:unknown[],manage=true):Promise<T>{
    if(!/^[A-Za-z0-9_-]{43}$/.test(token))throw new ParticipationError(401,"AUTH_REQUIRED");
    return accountTransaction(this.pool,async c=>{await c.query("SELECT set_config('app.session_hash',$1,true)",[tokenHash(token)]);
      const data=(await c.query<{data:T}>(sql,args)).rows[0]!.data;
      if(manage){const a=(await c.query<Actor>("SELECT * FROM pedpsy.account_actor()")).rows[0];if(!a)throw new ParticipationError(401,"AUTH_REQUIRED");
        requireAccountPermission({realm:a.actor_role==="researcher"?"researcher":"staff",userId:a.user_id,credentialId:a.credential_id,role:a.actor_role,sessionVersion:a.credential_version,expiresAt:Number(a.expires_at_ms),mfaVerifiedAt:a.mfa_verified_at_ms===null?null:Number(a.mfa_verified_at_ms)},"methods.manage",{},await accountWallTime(c),false);
      }return data;
    });
  }
  planning(token:string){return this.call<readonly PlanningMethod[]>(token,"SELECT pedpsy.read_method_planning_catalogue() data",[],false);}
  save(token:string,revision:number,draft:PreparedMethodDraft){if(!Number.isInteger(revision)||revision<0)throw new ParticipationError(400,"INVALID_METHOD_PACKAGE");return this.call<MethodLibraryRecord>(token,"SELECT pedpsy.save_method_library_draft($1,$2,$3,$4::jsonb,$5::jsonb) data",[revision,...methodDraftSqlInput(draft)]);}
  list(token:string){return this.call<readonly MethodLibraryRecord[]>(token,"SELECT pedpsy.list_method_library() data",[]);}
  read(token:string,id:string,version:string){return this.call<{record:MethodLibraryRecord;package_json:string}>(token,"SELECT pedpsy.read_method_library($1,$2) data",[id,version]);}
  catalog(token:string){return this.call<readonly CatalogMethod[]>(token,"SELECT pedpsy.read_available_methods() data",[],false);}
  transferStatus(token:string){return this.call<MethodTransferStatus>(token,"SELECT pedpsy.method_transfer_status() data",[]);}
}
