import {randomUUID} from "node:crypto";
import type {Pool} from "pg";
import type {StudyConstructor,StudyDesign,GroupDesign,StudySummary} from "../../ports/studies.js";
import {ParticipationError} from "../../ports/errors.js";
import {accountTransaction,tokenHash,accountWallTime} from "./account-transaction.js";
import type {AccountOperation,AccountRole} from "../../ports/accounts.js";
import {requireAccountPermission} from "../../ports/account-policy.js";
interface Actor{credential_id:string;user_id:string;actor_role:AccountRole;credential_version:number;expires_at_ms:string;mfa_verified_at_ms:string|null}
export class PostgresStudyConstructor implements StudyConstructor{
  constructor(private readonly pool:Pool){}
  private async call<T=StudyDesign>(token:string,operation:AccountOperation,sql:string,args:unknown[]):Promise<T>{
    if(!/^[A-Za-z0-9_-]{43}$/.test(token))throw new ParticipationError(401,"AUTH_REQUIRED");
    return accountTransaction(this.pool,async c=>{await c.query("SELECT set_config('app.session_hash',$1,true)",[tokenHash(token)]);
      const data=(await c.query<{data:T}>(sql,args)).rows[0]!.data;
      // Fixed SQL has already locked/rechecked current identity/scope. Central
      // policy is also a commit gate: a denied check rolls back mutation + audit.
      const a=(await c.query<Actor>("SELECT * FROM pedpsy.account_actor()")).rows[0];if(!a)throw new ParticipationError(401,"AUTH_REQUIRED");
      const studyId=typeof args[0]==="string"?args[0]:undefined;
      const own=studyId?(await c.query<{own:boolean}>("SELECT pedpsy.account_owns_study($1) own",[studyId])).rows[0]!.own:false;
      requireAccountPermission({realm:a.actor_role==="researcher"?"researcher":"staff",userId:a.user_id,credentialId:a.credential_id,role:a.actor_role,sessionVersion:a.credential_version,
        expiresAt:Number(a.expires_at_ms),mfaVerifiedAt:a.mfa_verified_at_ms===null?null:Number(a.mfa_verified_at_ms)},operation,studyId?{studyId}:{},await accountWallTime(c),own);
      return data;});
  }
  create(token:string,title:string){return this.call(token,"studies.configure","SELECT pedpsy.create_study($1,$2) data",[randomUUID(),title]);}
  createFor(token:string,ownerCredentialId:string,title:string){return this.call(token,"studies.configure","SELECT pedpsy.create_study_for_researcher($1,$2,$3) data",[randomUUID(),ownerCredentialId,title]);}
  listStaff(token:string){return this.call<StudySummary[]>(token,"studies.read","SELECT pedpsy.staff_study_design_list() data",[]);}
  read(token:string,id:string){return this.call(token,"studies.read","SELECT pedpsy.read_study_design($1) data",[id]);}
  group(token:string,id:string,groupId:string|undefined,input:{name:string;kind:GroupDesign["kind"];expected_version:number}){
    return this.call(token,"studies.configure","SELECT pedpsy.configure_study_group($1,$2,$3,$4,$5,$6) data",[id,input.expected_version,groupId??randomUUID(),input.name,input.kind,groupId===undefined]);
  }
  stage(token:string,id:string,stageId:string|undefined,input:{code:string;ordinal:number;expected_version:number}){
    return this.call(token,"studies.configure","SELECT pedpsy.configure_study_stage($1,$2,$3,$4,$5,$6) data",[id,input.expected_version,stageId??randomUUID(),input.code,input.ordinal,stageId===undefined]);
  }
  assign(token:string,id:string,input:{group_id:string;stage_id:string;release_ids:string[];expected_version:number}){
    return this.call(token,"studies.configure","SELECT pedpsy.configure_study_assignments($1,$2,$3,$4,$5::uuid[]) data",[id,input.expected_version,input.group_id,input.stage_id,input.release_ids]);
  }
  copy(token:string,id:string,input:{source_stage_id:string;code:string;ordinal:number;expected_version:number}){
    return this.call(token,"studies.configure","SELECT pedpsy.copy_study_stage($1,$2,$3,$4,$5,$6) data",[id,input.expected_version,input.source_stage_id,randomUUID(),input.code,input.ordinal]);
  }
  lifecycle(token:string,id:string,input:{status:"active"|"closed";expected_version:number}){
    return this.call(token,"studies.configure","SELECT pedpsy.change_study_lifecycle($1,$2,$3) data",[id,input.expected_version,input.status]);
  }
  title(token:string,id:string,input:{title:string;expected_version:number}){
    return this.call(token,"studies.configure","SELECT pedpsy.rename_study($1,$2,$3) data",[id,input.expected_version,input.title]);
  }
}
