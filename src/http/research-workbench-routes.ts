import type {FastifyInstance,FastifyRequest} from "fastify";
import type {createResearchWorkbenchApi,createParticipantProfileApi} from "../application/research-workbench-api.js";
import type {WorkbenchAction} from "../ports/research-workbench.js";
import {resultsCsv,resultsXlsx} from "../application/results-export.js";
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
  app.get(base+"/progress/participants",async r=>apis.research.participantStats(token(r,researcher),id(r)));
  app.get(base+"/export",async(r,reply)=>{
    const query=r.query as Record<string,unknown>;
    if(Object.keys(query).some(key=>key!=="format"))throw new ParticipationError(400,"INVALID_REQUEST");
    const format=query.format===undefined?"xlsx":query.format;
    if(format!=="xlsx"&&format!=="csv")throw new ParticipationError(400,"INVALID_REQUEST");
    const study=id(r),data=await apis.research.exportResults(readParticipantCookie(r.headers.cookie,researcher),study);
    const suffix=format==="csv"?"csv":"xlsx";
    reply.header("Content-Disposition",'attachment; filename="study-'+study+'-results.'+suffix+'"');
    reply.header("Cache-Control","no-store");
    if(format==="csv"){
      reply.type("text/csv; charset=utf-8");
      return reply.send(resultsCsv(data));
    }
    reply.type("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    return reply.send(await resultsXlsx(data));
  });  app.get(base+"/progress/methods",async r=>{
    const q=r.query as Record<string,unknown>;
    if(Object.keys(q).some(k=>k!=="group_id"&&k!=="stage_id"))throw new ParticipationError(400,"INVALID_REQUEST");
    const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const group=typeof q.group_id==="string"&&q.group_id?q.group_id:undefined;
    const stage=typeof q.stage_id==="string"&&q.stage_id?q.stage_id:undefined;
    if((group&&!uuid.test(group))||(stage&&!uuid.test(stage)))throw new ParticipationError(400,"INVALID_REQUEST");
    return apis.research.methodAnalytics(readParticipantCookie(r.headers.cookie,researcher),id(r),group,stage);
  });
  for(const action of ["initialize","group","stage","delete_stage","assign","copy_assignments","schema","remind"] as WorkbenchAction[])app.post(base+"/"+action,async r=>apis.research.change(token(r,researcher),id(r),action,r.body,proof(r)));
  app.get("/api/v2/participant/profile",async r=>apis.profile.read(token(r,participant)));
  for(const action of ["restart","save","complete"] as const)app.post("/api/v2/participant/profile/"+action,async r=>apis.profile.change(token(r,participant),action,r.body,proof(r)));
}
