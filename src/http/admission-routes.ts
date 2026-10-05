import type {FastifyInstance,FastifyRequest} from "fastify";
import type {createParticipantStageApi} from "../application/participant-stage-api.js";
import {ParticipationError} from "../ports/errors.js";
import {readParticipantCookie} from "./participant-app.js";
import type {ParticipantStagesSnapshot} from "../ports/participant-stages.js";
import type {ParticipantEnrollmentSnapshot} from "../ports/participant-enrollment.js";
export type AdmissionHttpApi=ReturnType<typeof createParticipantStageApi>;
const discovery=(s:ParticipantStagesSnapshot)=>({study_id:s.study_id,group_id:s.group_id,passport_schema_version:s.passport_schema_version,
  passport_completed:s.passport_completed,required_consents_accepted:s.required_consents_accepted,
  stages:s.stages.map(t=>({stage_id:t.stage_id,code:t.code,ordinal:t.ordinal,opening_revision:t.opening_revision,assignment_ids:[...t.assignment_ids]}))});
const enrollment=(s:ParticipantEnrollmentSnapshot)=>({study_id:s.study_id,group_id:s.group_id,stage_id:s.stage_id,enrollment_id:s.enrollment_id,
  attempts:s.attempts.map(a=>({attempt_id:a.attempt_id,assignment_id:a.assignment_id,release_id:a.release_id,status:a.status,revision:a.revision,current_item_id:a.current_item_id}))});
export function registerAdmissionRoutes(app:FastifyInstance,origin:string,api?:AdmissionHttpApi):void{
  const name=new URL(origin).protocol==="https:"?"__Host-pedpsy":"pedpsy_v2_demo";
  const configured=()=>{if(!api)throw new ParticipationError(503,"ADMISSION_NOT_CONFIGURED");return api;};
  const noQuery=(r:FastifyRequest)=>{if(r.query&&Object.keys(r.query as object).length)throw new ParticipationError(400,"INVALID_REQUEST");};
  const token=(r:FastifyRequest)=>readParticipantCookie(r.headers.cookie,name);
  const csrf=(r:FastifyRequest)=>typeof r.headers["x-pedpsy-csrf"]==="string"?r.headers["x-pedpsy-csrf"]:"";
  app.get("/api/v2/participant/stages",async r=>{const a=configured();noQuery(r);return discovery(await a.read(token(r)));});
  app.post("/api/v2/participant/stages/enroll",async r=>{const a=configured();noQuery(r);return enrollment(await a.enroll(token(r),r.body,csrf(r)));});
}
