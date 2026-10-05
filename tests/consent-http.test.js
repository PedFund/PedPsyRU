"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict"),{randomUUID}=require("node:crypto");
const {createWorkspaceApp}=require("../dist/src/http/workspace-app.js"),{createParticipantConsentApi}=require("../dist/src/application/participant-consent-api.js"),{ParticipationError}=require("../dist/src/ports/errors.js"),{csrfFor}=require("../storage/access.js");
const origin="http://127.0.0.1:4174",assets={html:"<!doctype html><title>Workspace</title>",js:"'use strict';",css:"body{}"},id=randomUUID(),own="p".repeat(43),staff="s".repeat(43),researcher="r".repeat(43);
const approval={purpose:"study_participation",document_version:"demo-participation-1",expected_policy_revision:0,accept:true};
function fixture({enabled=true,customOrigin=origin,auditFailure=false}={}){
 const calls=[],audit=[],deny=()=>{throw new ParticipationError(401,"AUTH_REQUIRED");};
 const documents=[{purpose:"contact_processing",version:"demo-contact-1",text:"Synthetic contact notice",required:true,accepted_at_ms:1,provenance:"contact_notice_confirmation"},
  {purpose:"study_participation",version:"demo-participation-1",text:"Synthetic participation notice",required:true,accepted_at_ms:null,provenance:"explicit_participant_acceptance"},
  {purpose:"secondary_research",version:"demo-secondary-1",text:"Synthetic optional notice",required:false,accepted_at_ms:null,provenance:"explicit_participant_acceptance"}].map(d=>({...d,legal_status:"synthetic_only",password:"private"}));
 const snapshot={study_id:id,policy_revision:0,required_consents_accepted:false,documents,email:"private@example.test",secret:"private"};
 const api=createParticipantConsentApi({read:async t=>{calls.push(["read",t]);return snapshot;},accept:async(t,b)=>{calls.push(["accept",t,b]);return {...snapshot,required_consents_accepted:b.purpose==="study_participation",documents:documents.map(d=>d.purpose===b.purpose?{...d,accepted_at_ms:2}:d)};}},{assert:(t,c)=>{if(c!==csrfFor(t))throw new ParticipationError(403,"CSRF_REJECTED");}});
 const denied=async(token,reason)=>{if(auditFailure)throw Error("private audit detail");audit.push([token,reason]);},participant={session:async t=>{if(t!==own)deny();return {csrf:csrfFor(t),attempts:[]};},denied},accounts={staffSession:async t=>{if(t!==staff)deny();return {};},researcherSession:async t=>{if(t!==researcher)deny();return {};},denied};
 const secure=new URL(customOrigin).protocol==="https:",name=secure?"__Host-pedpsy":"pedpsy_v2_demo",h=(token=own)=>({host:new URL(customOrigin).host,origin:customOrigin,cookie:name+"="+token,"x-pedpsy-csrf":csrfFor(token)});
 return {app:createWorkspaceApp(participant,accounts,customOrigin,assets,undefined,undefined,undefined,undefined,undefined,enabled?api:undefined),calls,audit,h,name};
}
test("consent HTTP: exact own document/source/version/time projection, no private additions or auto acceptance",async t=>{
 const f=fixture();t.after(()=>f.app.close());const r=await f.app.inject({url:"/api/v2/participant/consents",headers:f.h()});assert.equal(r.statusCode,200);assert.deepEqual(Object.keys(r.json()).sort(),["documents","policy_revision","required_consents_accepted","study_id"]);assert.equal(r.json().required_consents_accepted,false);assert.equal(r.json().documents.length,3);
 assert.deepEqual(Object.keys(r.json().documents[0]).sort(),["accepted_at_ms","legal_status","provenance","purpose","required","text","version"]);assert.equal(r.json().documents[1].accepted_at_ms,null);assert.equal(r.json().documents[2].required,false);assert.ok(!r.body.includes("private"));assert.equal(r.headers["cache-control"],"no-store");assert.equal(r.headers["referrer-policy"],"no-referrer");assert.equal(r.headers["set-cookie"],undefined);assert.deepEqual(f.calls,[["read",own]]);
});
test("consent HTTP: explicit one-purpose acceptance uses own CSRF, leaves other choice absent",async t=>{
 const f=fixture();t.after(()=>f.app.close());const r=await f.app.inject({method:"POST",url:"/api/v2/participant/consents/accept",headers:f.h(),payload:approval});assert.equal(r.statusCode,200);assert.equal(r.json().required_consents_accepted,true);assert.equal(r.json().documents[1].accepted_at_ms,2);assert.equal(r.json().documents[2].accepted_at_ms,null);assert.deepEqual(f.calls,[["accept",own,approval]]);
});
test("consent HTTP: caller scope/query/contact/false/clock injection rejected before consent ports",async t=>{
 const f=fixture();t.after(()=>f.app.close());
 for(const payload of [{...approval,participant_id:"foreign"},{...approval,study_id:id},{...approval,accepted_at_ms:0},{...approval,role:"superadministrator"},{...approval,purpose:"contact_processing"},{...approval,accept:false},{...approval,document_version:"wrong version"},{...approval,expected_policy_revision:"0"}])assert.equal((await f.app.inject({method:"POST",url:"/api/v2/participant/consents/accept",headers:f.h(),payload})).statusCode,400);
 assert.equal((await f.app.inject({url:"/api/v2/participant/consents?participant_id=foreign",headers:f.h()})).statusCode,400);assert.equal(f.calls.length,0);
});
test("consent HTTP: renamed staff/researcher/preauth, duplicate or absent cookies never impersonate participant",async t=>{
 const f=fixture();t.after(()=>f.app.close());for(const h of [f.h(staff),f.h(researcher),{...f.h(),cookie:f.h().cookie+"; "+f.h().cookie},{...f.h(),cookie:"pedpsy_registration_demo="+own},{...f.h(),cookie:""}])assert.equal((await f.app.inject({url:"/api/v2/participant/consents",headers:h})).statusCode,401);assert.equal(f.calls.length,0);assert.equal((await f.app.inject({method:"POST",url:"/api/v2/participant/consents/withdraw",headers:f.h(),payload:{}})).statusCode,404);assert.equal((await f.app.inject({method:"POST",url:"/api/v2/participant/consents/return",headers:f.h(),payload:{}})).statusCode,404);
});
test("consent HTTP: Origin/Host/SecFetch/CSRF/malformed/size/media/audit failure close boundaries",async t=>{
 const f=fixture();t.after(()=>f.app.close());const without={...f.h()};delete without.origin;
 for(const h of [{...f.h(),origin:"https://other.test"},{...f.h(),host:"other.test"},{...f.h(),"sec-fetch-site":"cross-site"},without,{...f.h(),"x-pedpsy-csrf":"wrong"}])assert.equal((await f.app.inject({method:"POST",url:"/api/v2/participant/consents/accept",headers:h,payload:approval})).statusCode,403);
 for(const [payload,type,status]of [["{broken","application/json",400],["x".repeat(9000),"application/json",413],["private","application/xml",415]])assert.equal((await f.app.inject({method:"POST",url:"/api/v2/participant/consents/accept",headers:{...f.h(),"content-type":type},payload})).statusCode,status);assert.equal(f.calls.length,0);
 const failed=fixture({auditFailure:true});t.after(()=>failed.app.close());const r=await failed.app.inject({url:"/api/v2/participant/consents",headers:failed.h(staff)});assert.equal(r.statusCode,500);assert.deepEqual(r.json(),{error:"INTERNAL_ERROR"});
});
test("consent HTTP: disabled boundary returns neutral503 without new consent ports, old workspace remains",async t=>{
 const f=fixture({enabled:false});t.after(()=>f.app.close());for(const [method,url,payload]of [["GET","/api/v2/participant/consents",undefined],["POST","/api/v2/participant/consents/accept",approval]]){const r=await f.app.inject({method,url,headers:f.h(),payload});assert.equal(r.statusCode,503);assert.deepEqual(r.json(),{error:"CONSENTS_NOT_CONFIGURED"});}assert.equal((await f.app.inject({url:"/workspace",headers:f.h()})).statusCode,200);assert.equal(f.calls.length,0);
});
test("consent HTTP: HTTPS reads only Host-bound own realm; no demo-cookie fallback",async t=>{
 const f=fixture({customOrigin:"https://example.test"});t.after(()=>f.app.close());assert.equal((await f.app.inject({url:"/api/v2/participant/consents",headers:f.h()})).statusCode,200);assert.equal((await f.app.inject({url:"/api/v2/participant/consents",headers:{...f.h(),cookie:"pedpsy_v2_demo="+own}})).statusCode,401);
});
