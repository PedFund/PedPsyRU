import type {FastifyInstance,FastifyRequest} from "fastify";
import type {MethodAuthoringApi} from "../application/method-authoring-api.js";
import {readParticipantCookie} from "./participant-app.js";
import {ParticipationError} from "../ports/errors.js";
export function registerMethodAuthoring(app:FastifyInstance,origin:string,api?:MethodAuthoringApi){
  if(!api)return;
  const secure=new URL(origin).protocol==="https:",cookie=secure?"__Host-pedpsy_staff":"pedpsy_staff_demo";
  const token=(r:FastifyRequest)=>readParticipantCookie(r.headers.cookie,cookie);
  const noQuery=(r:FastifyRequest)=>{if(Object.keys(r.query as object).length)throw new ParticipationError(400,"INVALID_REQUEST");};
  const proof=(r:FastifyRequest)=>typeof r.headers["x-pedpsy-csrf"]==="string"?r.headers["x-pedpsy-csrf"]:"";
  app.post("/api/v2/staff/method-authoring/validate",async r=>{noQuery(r);return api.validate(r.body);});
  app.post("/api/v2/staff/method-authoring/publish",async r=>{noQuery(r);return api.publish(token(r),proof(r),r.body);});
  app.post("/api/v2/staff/method-authoring/indicators",async r=>{noQuery(r);return api.correctIndicators(token(r),proof(r),r.body);});
}
