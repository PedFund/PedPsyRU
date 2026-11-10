import type {Pool} from "pg";
import type {ResearchWorkbench,WorkbenchAction,WorkbenchDesign,WorkbenchProgress,WorkbenchMethodProgress,WorkbenchMethodAnalytics,ParticipantPassportStats,ParticipantProfiles,ProfileSnapshot} from "../../ports/research-workbench.js";
import {ParticipationError} from "../../ports/errors.js";
import {accountTransaction,tokenHash} from "./account-transaction.js";
class WorkbenchConnection {
  constructor(protected readonly pool:Pool){}
  protected async call<T>(token:string,sql:string,args:unknown[]):Promise<T>{
    if(!/^[A-Za-z0-9_-]{43}$/.test(token))throw new ParticipationError(401,"AUTH_REQUIRED");
    return accountTransaction(this.pool,async c=>{await c.query("SELECT set_config('app.session_hash',$1,true)",[tokenHash(token)]);return (await c.query<{data:T}>(sql,args)).rows[0]!.data;});
  }
}
export class PostgresResearchWorkbench extends WorkbenchConnection implements ResearchWorkbench {
  read(token:string,study:string){return this.call<WorkbenchDesign>(token,"SELECT pedpsy.read_research_workbench($1) data",[study]);}
  change(token:string,study:string,version:number,action:WorkbenchAction,input:Record<string,unknown>){
    if(action==="schema")return this.call<WorkbenchDesign>(token,"SELECT pedpsy.change_research_profile_schema($1,$2,$3::jsonb) data",[study,version,JSON.stringify(input)]);
    if(action==="delete_stage")return this.call<WorkbenchDesign>(token,"SELECT pedpsy.close_research_stage($1,$2,$3) data",[study,version,String(input.stage_id)]);
    return this.call<WorkbenchDesign|{queued:number;mode:"synthetic"}>(token,"SELECT pedpsy.change_research_workbench($1,$2,$3,$4::jsonb) data",[study,version,action,JSON.stringify(input)]);
  }
  progress(token:string,study:string){return this.call<WorkbenchProgress>(token,"SELECT pedpsy.research_progress($1) data",[study]);}
  methodProgress(token:string,study:string){return this.call<WorkbenchMethodProgress>(token,"SELECT pedpsy.research_method_progress($1) data",[study]);}
  methodAnalytics(token:string,study:string,group?:string,stage?:string){return this.call<WorkbenchMethodAnalytics>(token,"SELECT pedpsy.research_method_analytics($1,$2,$3) data",[study,group??null,stage??null]);}
  participantStats(token:string,study:string){return this.call<ParticipantPassportStats>(token,"SELECT pedpsy.research_participant_passport_stats($1) data",[study]);}
}
export class PostgresParticipantProfiles extends WorkbenchConnection implements ParticipantProfiles {
  read(token:string){return this.call<ProfileSnapshot>(token,"SELECT pedpsy.own_profile('read',NULL,NULL,NULL) data",[]);}
  change(token:string,action:"restart"|"save"|"complete",input:{schema_version:number;expected_revision:number;values?:Readonly<Record<string,string|number>>}){
    return this.call<ProfileSnapshot>(token,"SELECT pedpsy.own_profile($1,$2,$3,$4::jsonb) data",[action,input.schema_version,input.expected_revision,input.values?JSON.stringify(input.values):null]);
  }
}
