import type {ParticipantEnrollment,EnrollmentSelection,ParticipantEnrollmentSnapshot} from "../ports/participant-enrollment.js";
import {ParticipationError} from "../ports/errors.js";
export function enrollmentSelection(input:unknown):EnrollmentSelection {
  const invalid=():never=>{throw new ParticipationError(400,"INVALID_ENROLLMENT_INPUT");};
  if(!input||typeof input!=="object"||Array.isArray(input))invalid();
  const b=input as Record<string,unknown>;
  if(Object.keys(b).sort().join(",")!=="expected_consent_policy_revision,expected_opening_revision,expected_passport_schema_version,stage_id"||
    typeof b.stage_id!=="string"||!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(b.stage_id)||
    b.expected_opening_revision!==1||!Number.isInteger(b.expected_passport_schema_version)||Number(b.expected_passport_schema_version)<1||Number(b.expected_passport_schema_version)>2147483646||
    !Number.isInteger(b.expected_consent_policy_revision)||Number(b.expected_consent_policy_revision)<0||Number(b.expected_consent_policy_revision)>2147483646)invalid();
  return {stage_id:b.stage_id as string,expected_opening_revision:1,expected_passport_schema_version:b.expected_passport_schema_version as number,
    expected_consent_policy_revision:b.expected_consent_policy_revision as number};
}
const snapshot=(s:ParticipantEnrollmentSnapshot):ParticipantEnrollmentSnapshot=>({study_id:s.study_id,group_id:s.group_id,stage_id:s.stage_id,enrollment_id:s.enrollment_id,
  attempts:s.attempts.map(a=>({attempt_id:a.attempt_id,assignment_id:a.assignment_id,release_id:a.release_id,status:a.status,revision:a.revision,current_item_id:a.current_item_id}))});
export function createParticipantEnrollmentApi(enrollment:ParticipantEnrollment,csrf:{assert(token:string,proof:string):void}) {return {
  enroll:(token:string,input:unknown,proof:string)=>{csrf.assert(token,proof);return enrollment.enroll(token,enrollmentSelection(input)).then(snapshot);}
};}
