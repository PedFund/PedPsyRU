import type {Pool} from "pg";
import type {ParticipantEnrollment,EnrollmentSelection,ParticipantEnrollmentSnapshot} from "../../ports/participant-enrollment.js";
import {ParticipationError} from "../../ports/errors.js";
import {accountTransaction,tokenHash} from "./account-transaction.js";
export class PostgresParticipantEnrollment implements ParticipantEnrollment {
  constructor(private readonly pool:Pool){}
  async enroll(token:string,input:EnrollmentSelection):Promise<ParticipantEnrollmentSnapshot>{
    if(typeof token!=="string"||!/^[A-Za-z0-9_-]{43}$/.test(token))throw new ParticipationError(401,"AUTH_REQUIRED");
    return accountTransaction(this.pool,async c=>{
      await c.query("SELECT set_config('app.session_hash',$1,true)",[tokenHash(token)]);
      return (await c.query<{data:ParticipantEnrollmentSnapshot}>("SELECT pedpsy.enroll_own_stage($1,$2,$3,$4) data",
        [input.stage_id,input.expected_opening_revision,input.expected_passport_schema_version,input.expected_consent_policy_revision])).rows[0]!.data;
    });
  }
}
