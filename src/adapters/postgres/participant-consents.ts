import type {Pool} from "pg";
import type {ParticipantConsents,ParticipantConsentsSnapshot,ConsentAcceptance} from "../../ports/participant-consents.js";
import {ParticipationError} from "../../ports/errors.js";
import {accountTransaction,tokenHash} from "./account-transaction.js";
export class PostgresParticipantConsents implements ParticipantConsents{
  constructor(private readonly pool:Pool){}
  private async call(token:string,sql:string,args:unknown[]):Promise<ParticipantConsentsSnapshot>{
    if(!/^[A-Za-z0-9_-]{43}$/.test(token))throw new ParticipationError(401,"AUTH_REQUIRED");
    return accountTransaction(this.pool,async c=>{
      await c.query("SELECT set_config('app.session_hash',$1,true)",[tokenHash(token)]);
      return (await c.query<{data:ParticipantConsentsSnapshot}>(sql,args)).rows[0]!.data;
    });
  }
  read(token:string){return this.call(token,"SELECT pedpsy.read_own_consents() data",[]);}
  accept(token:string,input:ConsentAcceptance){return this.call(token,"SELECT pedpsy.accept_own_consent($1,$2,$3,$4) data",[input.purpose,input.document_version,input.expected_policy_revision,input.accept]);}
}
