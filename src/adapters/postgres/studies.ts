import {randomUUID} from "node:crypto";
import type {Pool} from "pg";
import type {StudyConstructor,StudyDesign,GroupDesign} from "../../ports/studies.js";
import {ParticipationError} from "../../ports/errors.js";
import {accountTransaction,tokenHash} from "./account-transaction.js";
export class PostgresStudyConstructor implements StudyConstructor{
  constructor(private readonly pool:Pool){}
  private async call(token:string,sql:string,args:unknown[]):Promise<StudyDesign>{
    if(!/^[A-Za-z0-9_-]{43}$/.test(token))throw new ParticipationError(401,"AUTH_REQUIRED");
    return accountTransaction(this.pool,async c=>{await c.query("SELECT set_config('app.session_hash',$1,true)",[tokenHash(token)]);
      return (await c.query<{data:StudyDesign}>(sql,args)).rows[0]!.data;});
  }
  create(token:string,title:string){return this.call(token,"SELECT pedpsy.create_study($1,$2) data",[randomUUID(),title]);}
  read(token:string,id:string){return this.call(token,"SELECT pedpsy.read_study_design($1) data",[id]);}
  group(token:string,id:string,groupId:string|undefined,input:{name:string;kind:GroupDesign["kind"];expected_version:number}){
    return this.call(token,"SELECT pedpsy.configure_study_group($1,$2,$3,$4,$5,$6) data",[id,input.expected_version,groupId??randomUUID(),input.name,input.kind,groupId===undefined]);
  }
  stage(token:string,id:string,stageId:string|undefined,input:{code:string;ordinal:number;expected_version:number}){
    return this.call(token,"SELECT pedpsy.configure_study_stage($1,$2,$3,$4,$5,$6) data",[id,input.expected_version,stageId??randomUUID(),input.code,input.ordinal,stageId===undefined]);
  }
  assign(token:string,id:string,input:{group_id:string;stage_id:string;release_ids:string[];expected_version:number}){
    return this.call(token,"SELECT pedpsy.configure_study_assignments($1,$2,$3,$4,$5::uuid[]) data",[id,input.expected_version,input.group_id,input.stage_id,input.release_ids]);
  }
}
