import type {FastifyInstance,FastifyRequest} from "fastify";
import type {createMethodLibraryApi} from "../application/method-library.js";
import {readParticipantCookie} from "./participant-app.js";
import {ParticipationError} from "../ports/errors.js";
export type MethodLibraryHttpApi=ReturnType<typeof createMethodLibraryApi>;
export function registerMethodLibrary(app:FastifyInstance,origin:string,api?:MethodLibraryHttpApi){
  if(!api)return;const secure=new URL(origin).protocol==="https:";
  const cookie=(r:FastifyRequest,name:string)=>readParticipantCookie(r.headers.cookie,(secure?"__Host-pedpsy_":"pedpsy_")+name+(secure?"":"_demo"));
  const noQuery=(r:FastifyRequest)=>{if(Object.keys(r.query as object).length)throw new ParticipationError(400,"INVALID_REQUEST");};
  for(const realm of ["researcher","staff"] as const)app.get("/api/v2/"+realm+"/methods",async r=>{const q=r.query as Record<string,unknown>;if(Object.keys(q).some(k=>k!=="q"))throw new ParticipationError(400,"INVALID_REQUEST");return api.catalog(cookie(r,realm),q.q??"");});
  for(const realm of ["researcher","staff"] as const)app.get("/api/v2/"+realm+"/method-library/catalogue",async r=>{noQuery(r);return api.planning(cookie(r,realm));});
  app.get("/api/v2/staff/method-library",async r=>{noQuery(r);return api.list(cookie(r,"staff"));});
  app.get("/api/v2/staff/method-library/:id/:version",async r=>{noQuery(r);const p=r.params as {id:string;version:string};return api.read(cookie(r,"staff"),p.id,p.version);});
  app.get("/api/v2/staff/method-transfer/status",async r=>{noQuery(r);return api.transferStatus(cookie(r,"staff"));});
}
