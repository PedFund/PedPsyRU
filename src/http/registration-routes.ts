import type {FastifyInstance,FastifyRequest} from "fastify";
import type {createRegistrationHttpApi} from "../application/registration-http-api.js";
import {ParticipationError} from "../ports/errors.js";
import {readParticipantCookie} from "./participant-app.js";
type Api=ReturnType<typeof createRegistrationHttpApi>;
export function registrationCookieName(origin:string):string{return new URL(origin).protocol==="https:"?"__Host-pedpsy_registration":"pedpsy_registration_demo";}
export function registerRegistrationRoutes(app:FastifyInstance,origin:string,api?:Api):void{
  const secure=new URL(origin).protocol==="https:",name=registrationCookieName(origin),participantName=secure?"__Host-pedpsy":"pedpsy_v2_demo";
  const configured=():Api=>{if(!api)throw new ParticipationError(503,"REGISTRATION_NOT_CONFIGURED");return api;};
  const token=(r:FastifyRequest)=>readParticipantCookie(r.headers.cookie,name);
  const csrf=(r:FastifyRequest)=>typeof r.headers["x-pedpsy-csrf"]==="string"?r.headers["x-pedpsy-csrf"]:"";
  const invite=(r:FastifyRequest)=>typeof r.headers["x-pedpsy-invite"]==="string"?r.headers["x-pedpsy-invite"]:"";
  const cookie=(n:string,value:string,expiry:number)=>`${n}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${Math.max(0,Math.floor((expiry-Date.now())/1000))}${secure?"; Secure":""}`;
  const noQuery=(r:FastifyRequest)=>{if(r.query&&Object.keys(r.query as object).length)throw new ParticipationError(400,"INVALID_REGISTRATION_INPUT");};
  // Invite secrets travel in a same-origin header, not a URL or query. Browser
  // link fragments and the later UI are a separate block, never log headers.
  app.get("/api/v2/registration/preflight",async(r,reply)=>{const a=configured();noQuery(r);const p=a.preflight(token(r));
    reply.header("Set-Cookie",cookie(name,p.token,p.expiresAt));return {csrf:p.csrf,expires_at:p.expiresAt,synthetic:true};});
  app.get("/api/v2/registration/context",async r=>{const a=configured();noQuery(r);return a.context(invite(r));});
  app.post("/api/v2/registration/start",async r=>{const a=configured();noQuery(r);return a.start(invite(r),r.body,token(r),csrf(r));});
  app.post("/api/v2/registration/receipt",async r=>{const a=configured();noQuery(r);return a.receipt(invite(r),token(r),r.body,csrf(r));});
  app.post("/api/v2/registration/confirm",async r=>{const a=configured();noQuery(r);return a.confirm(invite(r),r.body,token(r),csrf(r));});
  app.post("/api/v2/registration/login",async(r,reply)=>{const a=configured();noQuery(r);const s=await a.login(r.body,token(r),csrf(r));
    reply.header("Set-Cookie",[cookie(participantName,s.token,s.expiresAt),cookie(name,"",0)]);
    // Does not create/impersonate/revoke administrative sessions. Realms remain
    // distinct; SQL returns only a participant identity for this email route.
    return {csrf:s.csrf,expires_at:s.expiresAt};});
}
