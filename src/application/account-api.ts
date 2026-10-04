import type {AccountAccess} from "../ports/accounts.js";
import type {StaffMfaGateway} from "../ports/staff-auth.js";
import type {ResearcherGateway,ResearcherManagement} from "../ports/researchers.js";
import type {StaffManagement} from "../ports/staff-management.js";
import type {StaffDiagnostics} from "../ports/staff-diagnostics.js";
import {ParticipationError} from "../ports/errors.js";
interface Dependencies{access:AccountAccess;auth:StaffMfaGateway;researchers:ResearcherGateway;researcherManagement:ResearcherManagement;staffManagement:StaffManagement;diagnostics:StaffDiagnostics}
interface Csrf{forToken(token:string):string;assert(token:string,csrf:string):void}
export function createAccountApi(d:Dependencies,csrf:Csrf){
  const staffSession=async(token:string)=>{
    const s=await d.access.session(token);if(s.role==="researcher")throw new ParticipationError(401,"AUTH_REQUIRED");
    return {...s,csrf:csrf.forToken(token),permissions:["studies.configure","researchers.read","researchers.invite","researchers.block","protocols.read","protocols.download","results.read","results.download",
      ...(s.role==="superadministrator"?["staff.roles.assign"]:[])]};
  };
  const mutate=async<T>(token:string,value:string,fn:()=>Promise<T>):Promise<T>=>{csrf.assert(token,value);return fn();};
  return {
    password:(input:unknown)=>d.auth.password(input),
    pendingCsrf:(token:string)=>csrf.forToken(token),
    enroll:(challenge:string,value:string)=>mutate(challenge,value,()=>d.auth.enroll(challenge)),
    verify:(challenge:string,input:unknown,value:string)=>mutate(challenge,value,()=>d.auth.verify(challenge,input)),
    staffSession,staffLogout:(token:string,value:string)=>d.auth.logout(token,value),
    researcherSession:async(token:string)=>{const home=await d.researchers.home(token),s=await d.access.session(token);if(s.role!=="researcher")throw new ParticipationError(401,"AUTH_REQUIRED");return {...s,csrf:csrf.forToken(token),home};},
    researcherAccept:(input:unknown)=>d.researchers.accept(input),researcherLogin:(input:unknown)=>d.researchers.login(input),researcherLogout:(token:string,value:string)=>d.researchers.logout(token,value),
    listResearchers:(token:string)=>d.researcherManagement.list(token),
    inviteResearcher:(token:string,value:string)=>mutate(token,value,()=>d.researcherManagement.invite(token)),
    blockResearcher:(token:string,id:string,value:string)=>mutate(token,value,()=>d.researcherManagement.block(token,id)),
    listStaff:(token:string)=>d.staffManagement.list(token),assignStaff:(token:string,input:unknown,value:string)=>mutate(token,value,()=>d.staffManagement.assign(token,input)),
    listProtocols:(token:string)=>d.diagnostics.list(token),readProtocol:(token:string,id:string)=>d.diagnostics.read(token,id),
    download:(token:string,id:string|undefined,value:string)=>mutate(token,value,()=>d.diagnostics.download(token,id)),
    denied:(token:string,reason:string)=>d.access.denied(token,reason)
  };
}
