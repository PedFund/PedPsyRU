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
      const snapshot=(await c.query<{data:ParticipantEnrollmentSnapshot}>("SELECT pedpsy.enroll_own_stage($1,$2,$3,$4) data",
        [input.stage_id,input.expected_opening_revision,input.expected_passport_schema_version,input.expected_consent_policy_revision])).rows[0]!.data;
      // Lightweight metadata for the stage list: title and item count, never
      // the full form. The query is scoped by the same own enrollment and uses
      // only tables already granted to the runtime role.
      const metadata=await c.query<{attempt_id:string;title:string|null;item_count:number;presentation_id:string|null}>(
        `SELECT a.id AS attempt_id,
                coalesce((SELECT p.title FROM pedpsy.release_presentation_corrections p
                          WHERE p.release_id=a.release_id AND p.title IS NOT NULL
                          ORDER BY p.created_at_ms DESC,p.id DESC LIMIT 1),
                         r.form_snapshot->>'title',r.method_id) AS title,
                (SELECT count(*)::int FROM pedpsy.release_items i WHERE i.release_id=a.release_id) AS item_count,
                r.form_snapshot->'presentation'->>'id' AS presentation_id
           FROM pedpsy.attempts a JOIN pedpsy.instrument_releases r ON r.id=a.release_id
          WHERE a.study_id=$1 AND a.enrollment_id=$2`,[snapshot.study_id,snapshot.enrollment_id]);
      const byAttempt=new Map(metadata.rows.map(row=>[row.attempt_id,row]));
      return {...snapshot,attempts:snapshot.attempts.map(attempt=>{
        const meta=byAttempt.get(attempt.attempt_id);
        return {...attempt,title:meta?.title||"Методика",item_count:Number(meta?.item_count??0),...(meta?.presentation_id?{presentation_id:meta.presentation_id}:{})};
      })};
    });
  }
}
