"use strict";
const {randomBytes,randomUUID}=require("node:crypto"),{csrfFor,equalText,validToken}=require("../storage/access.js"),{responsesDigest}=require("../storage/releases.js");
const {createAccountApi}=require("../dist/src/application/account-api.js"),{createParticipantApi}=require("../dist/src/application/participant-api.js"),{createParticipationService}=require("../dist/src/application/participation.js");
const {PostgresAccountAccess}=require("../dist/src/adapters/postgres/account-access.js"),{PostgresStaffMfa}=require("../dist/src/adapters/postgres/staff-mfa.js");
const {PostgresResearcherGateway,PostgresResearcherManagement}=require("../dist/src/adapters/postgres/researchers.js"),{PostgresStaffManagement}=require("../dist/src/adapters/postgres/staff-management.js"),{PostgresStaffDiagnostics}=require("../dist/src/adapters/postgres/staff-diagnostics.js");
const {PostgresUnitOfWork}=require("../dist/src/adapters/postgres/unit-of-work.js"),{PostgresParticipantGateway}=require("../dist/src/adapters/postgres/identity.js");
const {MfaVault}=require("../dist/src/adapters/security/mfa-vault.js"),{otpAt}=require("../dist/src/adapters/security/totp.js"),{ParticipationError}=require("../dist/src/ports/errors.js");
const {createWorkspaceApp}=require("../dist/src/http/workspace-app.js"),{workspaceAssets}=require("../dist/src/bootstrap/workspace-assets.js"),{staffFixture}=require("./staff-fixture.js");
const origin="http://127.0.0.1:4174",headers={host:"127.0.0.1:4174",origin};
const {PostgresStudyConstructor}=require("../dist/src/adapters/postgres/studies.js"),{createStudyApi}=require("../dist/src/application/study-api.js");
const {PostgresGroupInvitations}=require("../dist/src/adapters/postgres/group-invitations.js"),{createGroupInvitationApi}=require("../dist/src/application/participant-registration-api.js");
const {PostgresStageAccess}=require("../dist/src/adapters/postgres/stage-access.js"),{createStageAccessApi}=require("../dist/src/application/stage-access-api.js");
const {registrationBoundary}=require("../dist/src/bootstrap/registration-boundary.js");
const {passportBoundary}=require("../dist/src/bootstrap/passport-boundary.js");
const {consentBoundary}=require("../dist/src/bootstrap/consent-boundary.js");
const {admissionBoundary}=require("../dist/src/bootstrap/admission-boundary.js");
function workspaceFixture(f,customOrigin=origin,options={}){const vault=new MfaVault(randomBytes(32)),auth=new PostgresStaffMfa(f.runtime,vault),uow=new PostgresUnitOfWork(f.runtime);
  const account=createAccountApi({access:new PostgresAccountAccess(f.runtime),auth,researchers:new PostgresResearcherGateway(f.runtime),researcherManagement:new PostgresResearcherManagement(f.runtime),staffManagement:new PostgresStaffManagement(f.runtime),diagnostics:new PostgresStaffDiagnostics(f.runtime)},
    {forToken:csrfFor,assert:(t,c)=>{if(!validToken(t)||!equalText(c,csrfFor(t)))throw new ParticipationError(403,"CSRF_REJECTED");}});
  const participant=createParticipantApi(new PostgresParticipantGateway(f.runtime,uow),createParticipationService(uow,{newId:randomUUID,now:()=>new Date().toISOString(),digest:(ids,v)=>responsesDigest(ids.map(item_id=>({item_id})),v)}));
  const studies=createStudyApi(new PostgresStudyConstructor(f.runtime),{assert:(t,c)=>{if(!validToken(t)||!equalText(c,csrfFor(t)))throw new ParticipationError(403,"CSRF_REJECTED");}});
  const invitations=createGroupInvitationApi(new PostgresGroupInvitations(f.runtime),{assert:(t,c)=>{if(!validToken(t)||!equalText(c,csrfFor(t)))throw new ParticipationError(403,"CSRF_REJECTED");}});
  const stageAccess=createStageAccessApi(new PostgresStageAccess(f.runtime),{assert:(t,c)=>{if(!validToken(t)||!equalText(c,csrfFor(t)))throw new ParticipationError(403,"CSRF_REJECTED");}});
  const registration=options.contactKey?registrationBoundary(f.runtime,options.contactKey,customOrigin):undefined;
  const passports=options.passports?passportBoundary(f.runtime):undefined;
  const consents=options.consents?consentBoundary(f.runtime):undefined;
  const admissions=options.admissions?admissionBoundary(f.runtime):undefined;
  const app=createWorkspaceApp(participant,account,customOrigin,workspaceAssets(),studies,invitations,stageAccess,registration,passports,consents,admissions);
  return {app,vault,auth,account};}
function cookie(response,name){const list=response.headers["set-cookie"],all=Array.isArray(list)?list:[list];const found=all.find(x=>x?.startsWith(name+"="));if(!found)throw new Error("EXPECTED_COOKIE_MISSING");return found.split(";")[0];}
async function staffHttp(f,w,role="superadministrator"){
  const s=await staffFixture(f,role),p=await w.app.inject({method:"POST",url:"/api/v2/staff/password",headers,payload:{login_id:s.login,password:s.password}});if(p.statusCode!==200)throw new Error("PASSWORD_FLOW_FAILED");
  const pending=cookie(p,"pedpsy_pending_demo"),h={...headers,cookie:pending,"x-pedpsy-csrf":p.json().csrf};
  const enrolled=await w.app.inject({method:"POST",url:"/api/v2/staff/enroll",headers:h,payload:{}});if(enrolled.statusCode!==200)throw new Error("ENROLL_FLOW_FAILED");
  const factor=(await f.admin.query("SELECT secret_envelope FROM pedpsy.staff_mfa_factors WHERE credential_id=$1",[s.id])).rows[0],secret=w.vault.open(s.id,factor.secret_envelope);let v;
  try{v=await w.app.inject({method:"POST",url:"/api/v2/staff/verify",headers:h,payload:{type:"totp",code:await require("./mfa-fixture.js").previousFixtureCode(secret)}});}finally{secret.fill(0);}
  if(v.statusCode!==200)throw new Error("MFA_FLOW_FAILED");return {...s,pending,passwordResponse:p,verifyResponse:v,headers:{...headers,cookie:cookie(v,"pedpsy_staff_demo"),"x-pedpsy-csrf":v.json().csrf}};
}
module.exports={workspaceFixture,staffHttp,cookie,origin,headers};
