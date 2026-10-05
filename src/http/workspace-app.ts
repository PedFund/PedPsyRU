import type {FastifyInstance,FastifyRequest} from "fastify";
import type {createAccountApi} from "../application/account-api.js";
import type {createStudyApi} from "../application/study-api.js";
import type {createParticipantApi} from "../application/participant-api.js";
import type {createGroupInvitationApi} from "../application/participant-registration-api.js";
import type {createStageAccessApi} from "../application/stage-access-api.js";
import type {createRegistrationHttpApi} from "../application/registration-http-api.js";
import {registerRegistrationRoutes} from "./registration-routes.js";
import {registerPassportRoutes,type PassportHttpApis} from "./passport-routes.js";
import {registerConsentRoutes,type ConsentHttpApi} from "./consent-routes.js";
import {registerAdmissionRoutes,type AdmissionHttpApi} from "./admission-routes.js";
import {ParticipationError} from "../ports/errors.js";
import {createParticipantApp,readParticipantCookie} from "./participant-app.js";
import {createBaseApp} from "./app.js";
export interface WorkspaceAssets{html:string;js:string;css:string}
export function workspaceCookies(origin:string){return new URL(origin).protocol==="https:"?
  {staff:"__Host-pedpsy_staff",pending:"__Host-pedpsy_pending",researcher:"__Host-pedpsy_researcher"}:
  {staff:"pedpsy_staff_demo",pending:"pedpsy_pending_demo",researcher:"pedpsy_researcher_demo"};}
function staticRoutes(app:FastifyInstance,assets:WorkspaceAssets){
  app.addHook("onSend",async(_request,reply,payload)=>{reply.header("Content-Security-Policy","default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' blob:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");reply.header("Referrer-Policy","no-referrer");return payload;});
  app.get("/workspace",async(_r,reply)=>reply.type("text/html; charset=utf-8").send(assets.html));
  app.get("/workspace/app.js",async(_r,reply)=>reply.type("text/javascript; charset=utf-8").send(assets.js));
  app.get("/workspace/styles.css",async(_r,reply)=>reply.type("text/css; charset=utf-8").send(assets.css));
}
export function createWorkspacePreviewApp(assets:WorkspaceAssets){
  const app=createBaseApp();staticRoutes(app,assets);
  app.all("/api/*",async(_r,reply)=>reply.code(503).send({error:"DATABASE_NOT_CONFIGURED"}));
  app.setNotFoundHandler(async(_r,reply)=>reply.code(404).send({error:"NOT_AVAILABLE"}));
  app.setErrorHandler(async(_e,_r,reply)=>reply.code(500).send({error:"INTERNAL_ERROR"}));return app;
}
export function createWorkspaceApp(participant:ReturnType<typeof createParticipantApi>,accounts:ReturnType<typeof createAccountApi>,origin:string,assets:WorkspaceAssets,studies?:ReturnType<typeof createStudyApi>,invitations?:ReturnType<typeof createGroupInvitationApi>,stageAccess?:ReturnType<typeof createStageAccessApi>,registration?:ReturnType<typeof createRegistrationHttpApi>,passports?:PassportHttpApis,consents?:ConsentHttpApi,admissions?:AdmissionHttpApi){
  const names=workspaceCookies(origin),secure=new URL(origin).protocol==="https:";
  const token=(r:FastifyRequest,name:string)=>readParticipantCookie(r.headers.cookie,name);
  const csrf=(r:FastifyRequest)=>typeof r.headers["x-pedpsy-csrf"]==="string"?r.headers["x-pedpsy-csrf"]:"";
  const cookie=(name:string,value:string,expiry:number)=>`${name}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${Math.max(0,Math.floor((expiry-Date.now())/1000))}${secure?"; Secure":""}`;
  const empty=(body:unknown)=>{if(body&& (typeof body!=="object"||Array.isArray(body)||Object.keys(body).length))throw new ParticipationError(400,"INVALID_REQUEST");};
  return createParticipantApp(participant,origin,{
    denied:async(r,reason)=>{if(r.url.startsWith("/api/v2/registration/")){if(registration)await registration.denied(reason);else await accounts.denied("",reason);}
      else if(r.url.startsWith("/api/v2/participant/"))await participant.denied(token(r,secure?"__Host-pedpsy":"pedpsy_v2_demo"),reason);
      else await accounts.denied(token(r,r.url.startsWith("/api/v2/researcher/")?names.researcher:names.staff),reason);},
    register:app=>{
      staticRoutes(app,assets);
      registerRegistrationRoutes(app,origin,registration);
      registerPassportRoutes(app,origin,names,passports);
      registerConsentRoutes(app,origin,consents);
      registerAdmissionRoutes(app,origin,admissions);
      app.post("/api/v2/staff/password",async(r,reply)=>{const p=await accounts.password(r.body);reply.header("Set-Cookie",cookie(names.pending,p.challenge,p.expiresAt));
        // CSRF is computed server-side; raw challenge only goes into HttpOnly cookie.
        return {status:p.status,expires_at:p.expiresAt,csrf:accounts.pendingCsrf(p.challenge)};});
      app.post("/api/v2/staff/enroll",async r=>{empty(r.body);return accounts.enroll(token(r,names.pending),csrf(r));});
      app.post("/api/v2/staff/verify",async(r,reply)=>{const s=await accounts.verify(token(r,names.pending),r.body,csrf(r));
        reply.header("Set-Cookie",[cookie(names.staff,s.token,s.expiresAt),cookie(names.pending,"",0),cookie(names.researcher,"",0)]);return {csrf:s.csrf,expires_at:s.expiresAt,...(s.recoveryCodes?{recovery_codes:s.recoveryCodes}:{})};});
      app.get("/api/v2/staff/session",async r=>accounts.staffSession(token(r,names.staff)));
      app.post("/api/v2/staff/logout",async(r,reply)=>{empty(r.body);await accounts.staffLogout(token(r,names.staff),csrf(r));reply.header("Set-Cookie",cookie(names.staff,"",0));return {status:"signed_out"};});
      app.get("/api/v2/staff/researchers",async r=>accounts.listResearchers(token(r,names.staff)));
      app.post("/api/v2/staff/researchers/invite",async r=>{empty(r.body);return accounts.inviteResearcher(token(r,names.staff),csrf(r));});
      app.post("/api/v2/staff/researchers/:id/block",async r=>{empty(r.body);await accounts.blockResearcher(token(r,names.staff),(r.params as {id:string}).id,csrf(r));return {status:"blocked"};});
      app.get("/api/v2/staff/accounts",async r=>accounts.listStaff(token(r,names.staff)));
      app.post("/api/v2/staff/accounts/role",async r=>{await accounts.assignStaff(token(r,names.staff),r.body,csrf(r));return {status:"assigned"};});
      app.get("/api/v2/staff/protocols",async r=>accounts.listProtocols(token(r,names.staff)));
      app.get("/api/v2/staff/protocols/:id",async r=>accounts.readProtocol(token(r,names.staff),(r.params as {id:string}).id));
      app.post("/api/v2/staff/export",async(r,reply)=>{
        const b=r.body;if(!b||typeof b!=="object"||Array.isArray(b)||Object.keys(b).some(x=>x!=="attempt_id")||"attempt_id"in b&&typeof b.attempt_id!=="string")throw new ParticipationError(400,"INVALID_REQUEST");
        const data=await accounts.download(token(r,names.staff),(b as {attempt_id?:string}).attempt_id,csrf(r));
        reply.header("Content-Disposition",'attachment; filename="pedpsy-protocols.json"');return data;
      });
      app.post("/api/v2/researcher/accept",async r=>{await accounts.researcherAccept(r.body);return {status:"accepted"};});
      app.post("/api/v2/researcher/login",async(r,reply)=>{const s=await accounts.researcherLogin(r.body);reply.header("Set-Cookie",[cookie(names.researcher,s.token,s.expiresAt),cookie(names.staff,"",0),cookie(names.pending,"",0)]);return {csrf:s.csrf,expires_at:s.expiresAt};});
      app.get("/api/v2/researcher/session",async r=>accounts.researcherSession(token(r,names.researcher)));
      if(studies){
        app.get("/api/v2/staff/studies",async r=>studies.listStaff(token(r,names.staff)));
        app.post("/api/v2/researcher/studies",async r=>studies.create(token(r,names.researcher),r.body,csrf(r)));
        app.post("/api/v2/staff/studies",async r=>studies.createFor(token(r,names.staff),r.body,csrf(r)));
        app.get("/api/v2/researcher/studies/:id",async r=>studies.read(token(r,names.researcher),(r.params as {id:string}).id));
        app.get("/api/v2/staff/studies/:id",async r=>studies.read(token(r,names.staff),(r.params as {id:string}).id));
        app.post("/api/v2/researcher/studies/:id/groups",async r=>studies.group(token(r,names.researcher),(r.params as {id:string}).id,undefined,r.body,csrf(r)));
        app.patch("/api/v2/researcher/studies/:id/groups/:group",async r=>{const p=r.params as {id:string;group:string};return studies.group(token(r,names.researcher),p.id,p.group,r.body,csrf(r));});
        app.post("/api/v2/researcher/studies/:id/stages",async r=>studies.stage(token(r,names.researcher),(r.params as {id:string}).id,undefined,r.body,csrf(r)));
        app.patch("/api/v2/researcher/studies/:id/stages/:stage",async r=>{const p=r.params as {id:string;stage:string};return studies.stage(token(r,names.researcher),p.id,p.stage,r.body,csrf(r));});
        app.post("/api/v2/researcher/studies/:id/assignments",async r=>studies.assign(token(r,names.researcher),(r.params as {id:string}).id,r.body,csrf(r)));
        app.post("/api/v2/researcher/studies/:id/stages/copy",async r=>studies.copy(token(r,names.researcher),(r.params as {id:string}).id,r.body,csrf(r)));
        app.post("/api/v2/researcher/studies/:id/lifecycle",async r=>studies.lifecycle(token(r,names.researcher),(r.params as {id:string}).id,r.body,csrf(r)));
        app.patch("/api/v2/researcher/studies/:id",async r=>studies.title(token(r,names.researcher),(r.params as {id:string}).id,r.body,csrf(r)));
        app.post("/api/v2/staff/studies/:id/groups",async r=>studies.group(token(r,names.staff),(r.params as {id:string}).id,undefined,r.body,csrf(r)));
        app.patch("/api/v2/staff/studies/:id/groups/:group",async r=>{const p=r.params as {id:string;group:string};return studies.group(token(r,names.staff),p.id,p.group,r.body,csrf(r));});
        app.post("/api/v2/staff/studies/:id/stages",async r=>studies.stage(token(r,names.staff),(r.params as {id:string}).id,undefined,r.body,csrf(r)));
        app.patch("/api/v2/staff/studies/:id/stages/:stage",async r=>{const p=r.params as {id:string;stage:string};return studies.stage(token(r,names.staff),p.id,p.stage,r.body,csrf(r));});
        app.post("/api/v2/staff/studies/:id/assignments",async r=>studies.assign(token(r,names.staff),(r.params as {id:string}).id,r.body,csrf(r)));
        app.post("/api/v2/staff/studies/:id/stages/copy",async r=>studies.copy(token(r,names.staff),(r.params as {id:string}).id,r.body,csrf(r)));
        app.post("/api/v2/staff/studies/:id/lifecycle",async r=>studies.lifecycle(token(r,names.staff),(r.params as {id:string}).id,r.body,csrf(r)));
        app.patch("/api/v2/staff/studies/:id",async r=>studies.title(token(r,names.staff),(r.params as {id:string}).id,r.body,csrf(r)));
      }
      if(invitations){
        for(const [realm,name] of [["staff",names.staff]] as const){
          const base=`/api/v2/${realm}/studies/:id/groups/:group/invitations`;
          app.get(base,async r=>{const p=r.params as {id:string;group:string};return invitations.list(token(r,name),p.id,p.group);});
          app.post(base,async r=>{const p=r.params as {id:string;group:string};return invitations.create(token(r,name),p.id,p.group,r.body,csrf(r));});
          app.post(base+"/:invite/revoke",async r=>{const p=r.params as {id:string;group:string;invite:string};return invitations.revoke(token(r,name),p.id,p.group,p.invite,r.body,csrf(r));});
        }
        app.get("/api/v2/researcher/studies/:id/groups/:group/invitations",async r=>{
          const p=r.params as {id:string;group:string};return invitations.list(token(r,names.researcher),p.id,p.group);
        });
        app.post("/api/v2/researcher/studies/:id/groups/:group/invitations",async r=>{
          const p=r.params as {id:string;group:string};return invitations.create(token(r,names.researcher),p.id,p.group,r.body,csrf(r));
        });
        app.post("/api/v2/researcher/studies/:id/groups/:group/invitations/:invite/revoke",async r=>{
          const p=r.params as {id:string;group:string;invite:string};return invitations.revoke(token(r,names.researcher),p.id,p.group,p.invite,r.body,csrf(r));
        });
      }
      if(stageAccess){for(const [realm,name] of [["researcher",names.researcher],["staff",names.staff]] as const){
        const base=`/api/v2/${realm}/studies/:id/groups/:group/stage-access`;
        app.get(base,async r=>{const p=r.params as {id:string;group:string};return stageAccess.list(token(r,name),p.id,p.group);});
        app.post(base+"/:stage/open",async r=>{const p=r.params as {id:string;group:string;stage:string};return stageAccess.open(token(r,name),p.id,p.group,p.stage,r.body,csrf(r));});
      }}
      // Cookie names alone do not bind a bearer to its realm. This trusted
      // identity read prevents renamed staff/researcher cookies crossing routes;
      // the write adapter still rechecks current authority atomically under locks.
      app.addHook("preHandler",async r=>{
        if(/^\/api\/v2\/researcher\/studies(?:\/|$)/.test(r.url))await accounts.researcherSession(token(r,names.researcher));
        if(/^\/api\/v2\/staff\/studies(?:\/|$)/.test(r.url))await accounts.staffSession(token(r,names.staff));
        if(/^\/api\/v2\/participant\/passport(?:\/|$)/.test(r.url))await participant.session(token(r,secure?"__Host-pedpsy":"pedpsy_v2_demo"));
        if(/^\/api\/v2\/participant\/consents(?:\/|$)/.test(r.url))await participant.session(token(r,secure?"__Host-pedpsy":"pedpsy_v2_demo"));
        if(/^\/api\/v2\/participant\/stages(?:\/|$)/.test(r.url))await participant.session(token(r,secure?"__Host-pedpsy":"pedpsy_v2_demo"));
      });
      app.post("/api/v2/researcher/logout",async(r,reply)=>{empty(r.body);await accounts.researcherLogout(token(r,names.researcher),csrf(r));reply.header("Set-Cookie",cookie(names.researcher,"",0));return {status:"signed_out"};});
    }
  });
}
