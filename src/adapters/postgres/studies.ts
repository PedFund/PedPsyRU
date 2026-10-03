import {randomUUID} from "node:crypto";
import type {Pool} from "pg";
import type {StudyConstructor,StudyDesign} from "../../ports/studies.js";
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
}
