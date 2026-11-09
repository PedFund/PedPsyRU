import {methodLibraryBoundary} from "./method-library-boundary.js";
import {researchWorkbenchBoundary} from "./research-workbench-boundary.js";
import {Pool} from "pg";
import {randomUUID} from "node:crypto";
import {csrfFor,equalText,validToken} from "../../storage/access.js";
import {instrumentResponsesDigest} from "../adapters/instrument-digest.js";
import {PostgresUnitOfWork} from "../adapters/postgres/unit-of-work.js";
import {PostgresParticipantGateway} from "../adapters/postgres/identity.js";
import {createParticipationService} from "../application/participation.js";
import {createParticipantApi} from "../application/participant-api.js";
import {createWorkspaceApp} from "../http/workspace-app.js";
import {createAccountApi} from "../application/account-api.js";
import {PostgresAccountAccess} from "../adapters/postgres/account-access.js";
import {PostgresStaffMfa} from "../adapters/postgres/staff-mfa.js";
import {PostgresResearcherGateway,PostgresResearcherManagement} from "../adapters/postgres/researchers.js";
import {PostgresStaffManagement} from "../adapters/postgres/staff-management.js";
import {PostgresStaffDiagnostics} from "../adapters/postgres/staff-diagnostics.js";
import {MfaVault} from "../adapters/security/mfa-vault.js";
import {ParticipationError} from "../ports/errors.js";
import {workspaceAssets} from "./workspace-assets.js";
import {demoConfig} from "./demo-config.js";
import {productionConfig} from "./production-config.js";
import {PostgresStudyConstructor} from "../adapters/postgres/studies.js";
import {createStudyApi} from "../application/study-api.js";
import {createStageAccessApi} from "../application/stage-access-api.js";
import {PostgresStageAccess} from "../adapters/postgres/stage-access.js";
import {PostgresGroupInvitations} from "../adapters/postgres/group-invitations.js";
import {createGroupInvitationApi} from "../application/participant-registration-api.js";
import {contactDemoKey} from "./registration-config.js";
import {registrationBoundary} from "./registration-boundary.js";
import {passportBoundary} from "./passport-boundary.js";
import {consentBoundary} from "./consent-boundary.js";
import {admissionBoundary} from "./admission-boundary.js";
async function main(): Promise<void> {
  let pool:Pool|undefined;
  try {
    const production=process.env.PEDPSY_ENV==="production",config=production?productionConfig(process.env):undefined;
    pool=new Pool(production?config!.db:demoConfig(process.env));const uow=new PostgresUnitOfWork(pool);
    const api=createParticipantApi(new PostgresParticipantGateway(pool,uow),createParticipationService(uow,
      {newId:randomUUID,now:()=>new Date().toISOString(),digest:(ids,values)=>instrumentResponsesDigest(ids,values)}));
    const encoded=production?config!.mfaKey:process.env.PEDPSY_MFA_KEY;
    if(!encoded||Buffer.from(encoded,"base64").length!==32||Buffer.from(encoded,"base64").toString("base64")!==encoded)throw new Error("EXPLICIT_MFA_KEY_REQUIRED");
    const key=Buffer.from(encoded,"base64");const vault=new MfaVault(key);key.fill(0);
    const accounts=createAccountApi({access:new PostgresAccountAccess(pool),auth:new PostgresStaffMfa(pool,vault),researchers:new PostgresResearcherGateway(pool),
      researcherManagement:new PostgresResearcherManagement(pool),staffManagement:new PostgresStaffManagement(pool),diagnostics:new PostgresStaffDiagnostics(pool)},
      {forToken:csrfFor,assert:(token,value)=>{if(!validToken(token)||!equalText(value,csrfFor(token)))throw new ParticipationError(403,"CSRF_REJECTED");}});
    const studies=createStudyApi(new PostgresStudyConstructor(pool),{assert:(token,value)=>{if(!validToken(token)||!equalText(value,csrfFor(token)))throw new ParticipationError(403,"CSRF_REJECTED");}});
    const invitations=createGroupInvitationApi(new PostgresGroupInvitations(pool),{assert:(token,value)=>{if(!validToken(token)||!equalText(value,csrfFor(token)))throw new ParticipationError(403,"CSRF_REJECTED");}});
    const stageAccess=createStageAccessApi(new PostgresStageAccess(pool),{assert:(token,value)=>{if(!validToken(token)||!equalText(value,csrfFor(token)))throw new ParticipationError(403,"CSRF_REJECTED");}});
    const contactKey=contactDemoKey(process.env);let registration:ReturnType<typeof registrationBoundary>|undefined;
    const origin=production?config!.origin:"http://127.0.0.1:4174";
    try{if(contactKey)registration=registrationBoundary(pool,contactKey,origin);}finally{contactKey?.fill(0);}
    const passports=registration?passportBoundary(pool):undefined;
    const consents=registration?consentBoundary(pool):undefined;
    const admissions=registration?admissionBoundary(pool):undefined;
    const app=createWorkspaceApp(api,accounts,origin,workspaceAssets(),studies,invitations,stageAccess,registration,passports,consents,admissions,researchWorkbenchBoundary(pool),methodLibraryBoundary(pool));
    app.addHook("onClose",async()=>{await pool?.end();});
    const close=():void=>{void app.close();};process.once("SIGINT",close);process.once("SIGTERM",close);
    try {await app.listen({host:production?config!.host:"127.0.0.1",port:production?config!.port:4174});} catch {await app.close();throw new Error("DEMO_START_FAILED");}
  } catch {await pool?.end().catch(()=>{});process.exitCode=1;console.error("Synthetic PostgreSQL configuration required or unavailable; no data migrated.");}
}
void main();
