import type {Pool} from "pg";
import type {ParticipantPassports,ParticipantPassport,PassportSave,PassportCompletion} from "../../ports/participant-passport.js";
import {ParticipationError} from "../../ports/errors.js";
import {accountTransaction,tokenHash} from "./account-transaction.js";
export class PostgresParticipantPassports implements ParticipantPassports {
  constructor(private readonly pool:Pool){}
  private async call(token:string,sql:string,args:unknown[]):Promise<ParticipantPassport>{
    if(!/^[A-Za-z0-9_-]{43}$/.test(token))throw new ParticipationError(401,"AUTH_REQUIRED");
    return accountTransaction(this.pool,async c=>{
      await c.query("SELECT set_config('app.session_hash',$1,true)",[tokenHash(token)]);
      return (await c.query<{data:ParticipantPassport}>(sql,args)).rows[0]!.data;
    });
  }
  read(token:string){return this.call(token,"SELECT pedpsy.read_own_passport() data",[]);}
  save(token:string,input:PassportSave){return this.call(token,"SELECT pedpsy.save_own_passport($1,$2,$3::jsonb) data",[input.schema_version,input.expected_revision,JSON.stringify(input.values)]);}
  complete(token:string,input:PassportCompletion){return this.call(token,"SELECT pedpsy.complete_own_passport($1,$2) data",[input.schema_version,input.expected_revision]);}
}
