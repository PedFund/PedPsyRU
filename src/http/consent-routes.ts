import type {FastifyInstance,FastifyRequest} from "fastify";
import type {createParticipantConsentApi} from "../application/participant-consent-api.js";
import type {ParticipantConsentsSnapshot} from "../ports/participant-consents.js";
import {ParticipationError} from "../ports/errors.js";
import {readParticipantCookie} from "./participant-app.js";
export type ConsentHttpApi=ReturnType<typeof createParticipantConsentApi>;
function snapshot(p:ParticipantConsentsSnapshot){return {study_id:p.study_id,policy_revision:p.policy_revision,required_consents_accepted:p.required_consents_accepted,
  documents:p.documents.map(d=>({purpose:d.purpose,version:d.version,text:d.text,legal_status:d.legal_status,required:d.required,accepted_at_ms:d.accepted_at_ms,provenance:d.provenance}))};}
export function registerConsentRoutes(app:FastifyInstance,origin:string,api?:ConsentHttpApi):void{
  const name=new URL(origin).protocol==="https:"?"__Host-pedpsy":"pedpsy_v2_demo";
  const configured=()=>{if(!api)throw new ParticipationError(503,"CONSENTS_NOT_CONFIGURED");return api;};
  const noQuery=(r:FastifyRequest)=>{if(r.query&&Object.keys(r.query as object).length)throw new ParticipationError(400,"INVALID_REQUEST");};
  const token=(r:FastifyRequest)=>readParticipantCookie(r.headers.cookie,name);
  const csrf=(r:FastifyRequest)=>typeof r.headers["x-pedpsy-csrf"]==="string"?r.headers["x-pedpsy-csrf"]:"";
  app.get("/api/v2/participant/consents",async r=>{const a=configured();noQuery(r);return snapshot(await a.read(token(r)));});
  app.post("/api/v2/participant/consents/accept",async r=>{const a=configured();noQuery(r);return snapshot(await a.accept(token(r),r.body,csrf(r)));});
}
