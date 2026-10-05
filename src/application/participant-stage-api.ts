import type {ParticipantStages} from "../ports/participant-stages.js";
import type {ParticipantEnrollment} from "../ports/participant-enrollment.js";
import {createParticipantEnrollmentApi} from "./participant-enrollment-api.js";
export function createParticipantStageApi(stages:ParticipantStages,enrollment:ParticipantEnrollment,csrf:{assert(token:string,proof:string):void}){
  const admission=createParticipantEnrollmentApi(enrollment,csrf);
  return {read:async(token:string)=>{const s=await stages.read(token);return {study_id:s.study_id,group_id:s.group_id,
    passport_schema_version:s.passport_schema_version,passport_completed:s.passport_completed,required_consents_accepted:s.required_consents_accepted,
    stages:s.stages.map(t=>({stage_id:t.stage_id,code:t.code,ordinal:t.ordinal,opening_revision:t.opening_revision,assignment_ids:[...t.assignment_ids]}))};},
    enroll:admission.enroll};
}
