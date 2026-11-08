/**
 * Explicit, identity-minimized projection for the future researcher raw-data export.
 * This is not an authorization boundary or a database query. The caller must first
 * enforce study ownership and select a bounded, audited dataset.
 */
export interface RawResponseSource {
  study_id:string;
  participant_id:string;
  group_id:string;
  stage_id:string;
  assignment_id:string;
  attempt_id:string;
  release_id:string;
  method_version_id:string;
  handler_version:string;
  key_digest:string;
  item_id:string;
  answer:unknown;
  attempt_status:"draft"|"completed";
  revision:number;
}

export interface RawResponseExportRow {
  study_id:string;
  participant_id:string;
  group_id:string;
  stage_id:string;
  assignment_id:string;
  attempt_id:string;
  release_id:string;
  method_version_id:string;
  handler_version:string;
  key_digest:string;
  item_id:string;
  answer_json:string;
  attempt_status:"draft"|"completed";
  revision:number;
}

export const RAW_RESPONSE_EXPORT_COLUMNS:readonly (keyof RawResponseExportRow)[]=Object.freeze([
  "study_id","participant_id","group_id","stage_id","assignment_id","attempt_id",
  "release_id","method_version_id","handler_version","key_digest","item_id",
  "answer_json","attempt_status","revision"
]);

/** Keep raw answers as JSON, not numeric coercions or interpreted scores. */
export function projectRawResponseRow(source:RawResponseSource):RawResponseExportRow {
  if(source===null||typeof source!=="object")throw new TypeError("Invalid export source");
  if(source.attempt_status!=="draft"&&source.attempt_status!=="completed")throw new TypeError("Invalid attempt status");
  if(!Number.isSafeInteger(source.revision)||source.revision<0)throw new TypeError("Invalid revision");
  for(const field of RAW_RESPONSE_EXPORT_COLUMNS){
    if(field==="answer_json"||field==="attempt_status"||field==="revision")continue;
    if(typeof source[field]!=="string"||!source[field])throw new TypeError("Invalid export identifier");
  }
  const answer_json=JSON.stringify(source.answer);
  if(typeof answer_json!=="string")throw new TypeError("Invalid raw answer");
  return {
    study_id:source.study_id,participant_id:source.participant_id,
    group_id:source.group_id,stage_id:source.stage_id,
    assignment_id:source.assignment_id,attempt_id:source.attempt_id,
    release_id:source.release_id,method_version_id:source.method_version_id,
    handler_version:source.handler_version,key_digest:source.key_digest,
    item_id:source.item_id,answer_json,attempt_status:source.attempt_status,
    revision:source.revision
  };
}
