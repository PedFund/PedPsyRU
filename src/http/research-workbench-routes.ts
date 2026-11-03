import type {FastifyInstance,FastifyRequest} from "fastify";
import type {createResearchWorkbenchApi,createParticipantProfileApi} from "../application/research-workbench-api.js";
import type {WorkbenchAction} from "../ports/research-workbench.js";
import {readParticipantCookie} from "./participant-app.js";
import {ParticipationError} from "../ports/errors.js";
export interface ResearchWorkbenchApis {research:ReturnType<typeof createResearchWorkbenchApi>;profile:ReturnType<typeof createParticipantProfileApi>}
export function registerResearchWorkbench(app:FastifyInstance,origin:string,apis?:ResearchWorkbenchApis){
  if(!apis)return;
  const secure=new URL(origin).protocol==="https:",researcher=secure?"__Host-pedpsy_researcher":"pedpsy_researcher_demo",participant=secure?"__Host-pedpsy":"pedpsy_v2_demo";
  const token=(r:FastifyRequest,name:string)=>{if(r.query&&Object.keys(r.query as object).length)throw new ParticipationError(400,"INVALID_REQUEST");return readParticipantCookie(r.headers.cookie,name);};
  const proof=(r:FastifyRequest)=>typeof r.headers["x-pedpsy-csrf"]==="string"?r.headers["x-pedpsy-csrf"]:"";
  const id=(r:FastifyRequest)=>(r.params as {id:string}).id;
  const base="/api/v2/researcher/studies/:id/workbench";
  app.get(base,async r=>apis.research.read(token(r,researcher),id(r)));
  app.get(base+"/progress",async r=>apis.research.progress(token(r,researcher),id(r)));
  for(const action of ["initialize","group","stage","assign","copy_assignments","schema","remind"] as WorkbenchAction[])app.post(base+"/"+action,async r=>apis.research.change(token(r,researcher),id(r),action,r.body,proof(r)));
  app.get("/api/v2/participant/profile",async r=>apis.profile.read(token(r,participant)));
  for(const action of ["restart","save","complete"] as const)app.post("/api/v2/participant/profile/"+action,async r=>apis.profile.change(token(r,participant),action,r.body,proof(r)));
}
