import type {Pool} from "pg";
import {accountTransaction,tokenHash} from "./account-transaction.js";
import {ParticipationError} from "../../ports/errors.js";
import {csrfFor,equalText} from "../../../storage/access.js";
export interface PublishAuthoringInput {
  readonly method_id:string;readonly method_version_id:string;readonly package_version:string;
  readonly title:string;readonly authors:readonly string[];readonly indicators:readonly string[];
  readonly form_snapshot:unknown;readonly key:unknown;readonly package_json:string;
  readonly form_digest:string;readonly key_digest:string;readonly package_digest:string;
}
export interface PublishAuthoringResult {release_id:string;method_id:string;method_version_id:string;form_digest:string;key_digest:string}
export class PostgresMethodAuthoring {
  constructor(private readonly pool:Pool){}
  async publish(token:string,proof:string,input:Record<string,unknown>):Promise<PublishAuthoringResult>{
    if(!/^[A-Za-z0-9_-]{43}$/.test(token))throw new ParticipationError(401,"AUTH_REQUIRED");
    if(!equalText(proof,csrfFor(token)))throw new ParticipationError(403,"CSRF_REJECTED");
    return accountTransaction(this.pool,async c=>{
      await c.query("SELECT set_config('app.session_hash',$1,true)",[tokenHash(token)]);
      const result=await c.query<{data:PublishAuthoringResult}>("SELECT pedpsy.publish_authoring_method($1::jsonb) data",[JSON.stringify(input)]);
      return result.rows[0]!.data;
    });
  }
  async correctIndicators(token:string,proof:string,input:{method_id:string;labels:readonly string[];reason?:string}):Promise<{release_id:string;method_id:string;labels:readonly string[]}>{
    if(!/^[A-Za-z0-9_-]{43}$/.test(token))throw new ParticipationError(401,"AUTH_REQUIRED");
    if(!equalText(proof,csrfFor(token)))throw new ParticipationError(403,"CSRF_REJECTED");
    return accountTransaction(this.pool,async c=>{
      await c.query("SELECT set_config('app.session_hash',$1,true)",[tokenHash(token)]);
      const result=await c.query<{data:{release_id:string;method_id:string;labels:readonly string[]}}>("SELECT pedpsy.correct_authoring_indicators($1,$2::jsonb,$3) data",[input.method_id,JSON.stringify(input.labels),input.reason??"owner_correction"]);
      return result.rows[0]!.data;
    });
  }
}
