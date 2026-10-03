import type {FastifyRequest,FastifyInstance} from "fastify";
import {createBaseApp} from "./app.js";
import type {createParticipantApi} from "../application/participant-api.js";
import {ParticipationError} from "../ports/errors.js";
import type {AttemptSnapshot,StoredResult} from "../ports/participation.js";
type Api = ReturnType<typeof createParticipantApi>;
export function readParticipantCookie(value: unknown, name: string): string {
  if (typeof value !== "string" || value.length > 2048) return "";
  const found=value.split(";").map(x=>x.trim()).filter(x=>x.startsWith(name+"="));
  if (found.length!==1) return "";
  const token=found[0]!.slice(name.length+1);
  return /^[A-Za-z0-9_-]{43}$/.test(token)?token:"";
}
const draftDto = (s: AttemptSnapshot) => ({attempt_id:s.id,status:s.status,revision:s.revision,current_item_id:s.currentItemId,release_id:s.releaseId,
  responses:s.responses.map(r=>({item_id:r.item_id,value:r.value}))});
const resultDto = (r: StoredResult) => ({result_id:r.id,attempt_id:r.attemptId,input_revision:r.inputRevision,responses_digest:r.responsesDigest,calculated_at:r.calculatedAt,
  status:r.payload.status,contract_version:r.payload.contract_version,method_version_id:r.payload.method_version_id,handler_version:r.payload.handler_version,
  measures:r.payload.measures.map(m=>({code:m.code,label:m.label,value:m.value,representation:m.representation}))});
export function createParticipantApp(api: Api, origin: string,extension?:{register:(app:FastifyInstance)=>void;denied:(request:FastifyRequest,reason:string)=>Promise<void>}) {
  const url=new URL(origin),secure=url.protocol==="https:";
  if (url.origin!==origin || !secure && !(url.protocol==="http:" && ["127.0.0.1","localhost"].includes(url.hostname))) throw new Error("EXPLICIT_SAFE_ORIGIN_REQUIRED");
  const cookieName=secure?"__Host-pedpsy":"pedpsy_v2_demo";
  const app=createBaseApp();
  const token=(r:FastifyRequest):string=>readParticipantCookie(r.headers.cookie,cookieName);
  const csrf=(r:FastifyRequest):string=>typeof r.headers["x-pedpsy-csrf"]==="string"?r.headers["x-pedpsy-csrf"]:"";
  const cookie=(value:string,age:number):string=>`${cookieName}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${secure?"; Secure":""}`;
  app.addHook("onRequest",async request=>{
    const source=request.headers.origin,site=request.headers["sec-fetch-site"];
    if(request.headers.host!==url.host || source!==undefined && source!==origin || site!==undefined && !["same-origin","none"].includes(String(site)) ||
      !["GET","HEAD"].includes(request.method) && source!==origin) throw new ParticipationError(403,"ORIGIN_REJECTED");
  });
  app.setNotFoundHandler(async (_request,reply)=>reply.code(404).send({error:"NOT_AVAILABLE"}));
  app.setErrorHandler(async (error,request,reply)=>{
    const hinted=error && typeof error==="object" && "statusCode" in error && typeof error.statusCode==="number"?error.statusCode:0;
    const status=error instanceof ParticipationError?error.status:[400,413,415].includes(hinted)?hinted:500;
    const code=error instanceof ParticipationError?error.code:status===413?"BODY_TOO_LARGE":status===415?"UNSUPPORTED_CONTENT_TYPE":status===400?"INVALID_REQUEST":"INTERNAL_ERROR";
    try {if(extension)await extension.denied(request,code);else await api.denied(token(request),code);} catch {return reply.code(500).send({error:"INTERNAL_ERROR"});}
    return reply.code(status).send({error:code});
  });
  app.post("/api/v2/participant/login",async (request,reply)=>{
    const session=await api.login(request.body);
    reply.header("Set-Cookie",cookie(session.token,Math.max(0,Math.floor((session.expiresAt-Date.now())/1000))));
    return {csrf:session.csrf,expires_at:session.expiresAt};
  });
  app.get("/api/v2/participant/session",async request=>api.session(token(request)));
  app.post("/api/v2/participant/logout",async (request,reply)=>{
    if(request.body && (typeof request.body!=="object" || Object.keys(request.body).length))throw new ParticipationError(400,"INVALID_REQUEST");
    await api.logout(token(request),csrf(request));reply.header("Set-Cookie",cookie("",0));return {status:"signed_out"};
  });
  const id=(r:FastifyRequest):string=>(r.params as {id:string}).id;
  app.get("/api/v2/participant/attempts/:id",async request=>draftDto(await api.read(token(request),id(request))));
  app.get("/api/v2/participant/attempts/:id/form",async request=>api.form(token(request),id(request)));
  app.put("/api/v2/participant/attempts/:id/draft",async request=>draftDto(await api.save(token(request),id(request),request.body,csrf(request))));
  app.post("/api/v2/participant/attempts/:id/complete",async request=>resultDto(await api.complete(token(request),id(request),request.body,csrf(request))));
  app.get("/api/v2/participant/attempts/:id/result",async request=>resultDto(await api.result(token(request),id(request))));
  // Standalone participant app has no staff/library/SQL routes; composition may
  // explicitly register the separately authenticated workspace boundary.
  extension?.register(app);
  return app;
}
