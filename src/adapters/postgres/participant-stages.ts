import type {Pool} from "pg";
import type {ParticipantStages,ParticipantStagesSnapshot} from "../../ports/participant-stages.js";
import {ParticipationError} from "../../ports/errors.js";
import {accountTransaction,tokenHash} from "./account-transaction.js";
export class PostgresParticipantStages implements ParticipantStages {
  constructor(private readonly pool:Pool){}
  async read(token:string):Promise<ParticipantStagesSnapshot>{
    if(typeof token!=="string"||!/^[A-Za-z0-9_-]{43}$/.test(token))throw new ParticipationError(401,"AUTH_REQUIRED");
    return accountTransaction(this.pool,async c=>{
      await c.query("SELECT set_config('app.session_hash',$1,true)",[tokenHash(token)]);
      return (await c.query<{data:ParticipantStagesSnapshot}>("SELECT pedpsy.read_own_stages() data")).rows[0]!.data;
    });
  }
}
