"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict"),{randomUUID}=require("node:crypto");
const {createWorkspaceApp}=require("../dist/src/http/workspace-app.js"),{createPassportSchemaApi}=require("../dist/src/application/passport-schema-api.js"),{createParticipantPassportApi}=require("../dist/src/application/participant-passport-api.js"),{ParticipationError}=require("../dist/src/ports/errors.js"),{csrfFor}=require("../storage/access.js");
const origin="http://127.0.0.1:4174",assets={html:"<!doctype html><title>Workspace</title>",js:"'use strict';",css:"body{}"},id=randomUUID(),own="p".repeat(43),staff="s".repeat(43),researcher="r".repeat(43),field={key:"age",label:"Возраст",kind:"integer",required:true,min:0,max:130};
function fixture({enabled=true,customOrigin=origin,auditFailure=false}={}){
  const calls=[],audit=[],deny=()=>{throw new ParticipationError(401,"AUTH_REQUIRED");},assertCsrf={assert:(token,proof)=>{if(proof!==csrfFor(token))throw new ParticipationError(403,"CSRF_REJECTED");}};
  const schema={study_id:id,study_version:0,schema_version:1,frozen:false,fields:[{...field,score:100}],contact:"private contact",secret:"private key"};
  const profile={study_id:id,schema_version:1,revision:1,status:"draft",fields:[{...field,score:100}],values:{age:42,email:"private@example.test"},password:"private password"};
  const schemas=createPassportSchemaApi({read:async(...a)=>{calls.push(["schema.read",...a]);return schema;},configure:async(...a)=>{calls.push(["schema.configure",...a]);return schema;}},assertCsrf);
  const api=createParticipantPassportApi({read:async(...a)=>{calls.push(["own.read",...a]);return profile;},save:async(...a)=>{calls.push(["own.save",...a]);return profile;},complete:async(...a)=>{calls.push(["own.complete",...a]);return {...profile,status:"completed",revision:2};}},assertCsrf);
  const denied=async(token,reason)=>{if(auditFailure)throw Error("private audit details");audit.push([token,reason]);};
  const participant={session:async token=>{if(token!==own)deny();return {csrf:csrfFor(token),attempts:[]};},denied},accounts={researcherSession:async token=>{if(token!==researcher)deny();return {};},staffSession:async token=>{if(token!==staff)deny();return {};},denied};
  const secure=new URL(customOrigin).protocol==="https:",names=secure?{own:"__Host-pedpsy",staff:"__Host-pedpsy_staff",researcher:"__Host-pedpsy_researcher"}:{own:"pedpsy_v2_demo",staff:"pedpsy_staff_demo",researcher:"pedpsy_researcher_demo"};
  const h=(role="own",token={own,staff,researcher}[role])=>({host:new URL(customOrigin).host,origin:customOrigin,cookie:names[role]+"="+token,"x-pedpsy-csrf":csrfFor(token)});
  return {app:createWorkspaceApp(participant,accounts,customOrigin,assets,undefined,undefined,undefined,undefined,enabled?{schemas,own:api}:undefined),calls,audit,h,names};
}
test("passport HTTP: own session and exact value/metadata projections never return private additions",async t=>{
  const f=fixture();t.after(()=>f.app.close());const r=await f.app.inject({url:"/api/v2/participant/passport",headers:f.h()});assert.equal(r.statusCode,200);assert.deepEqual(Object.keys(r.json()).sort(),["fields","revision","schema_version","status","study_id","values"]);assert.deepEqual(r.json().values,{age:42});assert.deepEqual(r.json().fields,[field]);assert.ok(!r.body.includes("private")&&!r.body.includes("score"));assert.equal(r.headers["cache-control"],"no-store");assert.equal(r.headers["referrer-policy"],"no-referrer");assert.equal(r.headers["set-cookie"],undefined);
  for(const role of ["staff","researcher"]){const s=await f.app.inject({url:`/api/v2/${role}/studies/${id}/passport-schema`,headers:f.h(role)});assert.equal(s.statusCode,200);assert.deepEqual(s.json().fields,[field]);assert.ok(!s.body.includes("private"));}
});
test("passport HTTP: saved-only own completion and distinct metadata mutation use their session CSRF",async t=>{
  const f=fixture();t.after(()=>f.app.close());const body={schema_version:1,expected_revision:0,values:{age:42}},schema={expected_version:0,expected_schema_version:1,basic_required:{city:false},additional_fields:[]};
  assert.equal((await f.app.inject({method:"PUT",url:"/api/v2/participant/passport/draft",headers:f.h(),payload:body})).statusCode,200);
  assert.equal((await f.app.inject({method:"POST",url:"/api/v2/participant/passport/complete",headers:f.h(),payload:{schema_version:1,expected_revision:1}})).json().status,"completed");
  assert.equal((await f.app.inject({method:"PATCH",url:`/api/v2/staff/studies/${id}/passport-schema`,headers:f.h("staff"),payload:schema})).statusCode,200);assert.deepEqual(f.calls.map(x=>x[0]),["own.save","own.complete","schema.configure"]);assert.equal(f.calls[0][1],own);assert.equal(f.calls[2][1],staff);
});
test("passport HTTP: renamed realm/duplicate/missing cookies cannot reach passport ports",async t=>{
  const f=fixture();t.after(()=>f.app.close());
  for(const h of [f.h("own",staff),f.h("own",researcher),{...f.h(),cookie:f.h().cookie+"; "+f.h().cookie},{...f.h(),cookie:"pedpsy_registration_demo="+own},{...f.h(),cookie:""}])assert.equal((await f.app.inject({url:"/api/v2/participant/passport",headers:h})).statusCode,401);
  for(const [realm,h]of [["staff",f.h("staff",researcher)],["researcher",f.h("researcher",staff)]])assert.equal((await f.app.inject({url:`/api/v2/${realm}/studies/${id}/passport-schema`,headers:h})).statusCode,401);assert.equal(f.calls.length,0);
});
test("passport HTTP: query/caller authority/inline complete values/stale-shaped DTO rejected before ports",async t=>{
  const f=fixture();t.after(()=>f.app.close());const body={schema_version:1,expected_revision:0,values:{age:42}};
  for(const [method,url,payload]of [["GET","/api/v2/participant/passport?participant_id=foreign",undefined],["PUT","/api/v2/participant/passport/draft",{...body,study_id:id}],["PUT","/api/v2/participant/passport/draft",{...body,values:{age:null}}],["POST","/api/v2/participant/passport/complete",body],["PATCH",`/api/v2/staff/studies/${id}/passport-schema?role=superadministrator`,{}]]){
    const r=await f.app.inject({method,url,headers:f.h(method==="PATCH"?"staff":"own"),payload});assert.equal(r.statusCode,400);assert.ok(!r.body.includes("foreign"));
  }assert.equal(f.calls.length,0);
});
test("passport HTTP: Origin/Host/SecFetch/CSRF/body/media and mandatory denial audit fail closed",async t=>{
  const f=fixture();t.after(()=>f.app.close());const h=f.h(),without={...h};delete without.origin;const body={schema_version:1,expected_revision:0,values:{age:42}};
  for(const bad of [{...h,origin:"https://other.test"},{...h,host:"other.test"},{...h,"sec-fetch-site":"cross-site"},without,{...h,"x-pedpsy-csrf":"wrong"}])assert.equal((await f.app.inject({method:"PUT",url:"/api/v2/participant/passport/draft",headers:bad,payload:body})).statusCode,403);
  for(const [payload,type,status]of [["{broken","application/json",400],["x".repeat(9000),"application/json",413],["private","application/xml",415]])assert.equal((await f.app.inject({method:"PUT",url:"/api/v2/participant/passport/draft",headers:{...h,"content-type":type},payload})).statusCode,status);assert.equal(f.calls.length,0);
  const failure=fixture({auditFailure:true});t.after(()=>failure.app.close());const r=await failure.app.inject({url:"/api/v2/participant/passport",headers:failure.h("own",staff)});assert.equal(r.statusCode,500);assert.deepEqual(r.json(),{error:"INTERNAL_ERROR"});
});
test("passport HTTP: disabled boundary returns neutral503, legacy workspace/registration layout remains",async t=>{
  const f=fixture({enabled:false});t.after(()=>f.app.close());for(const [url,h]of [["/api/v2/participant/passport",f.h()],[`/api/v2/staff/studies/${id}/passport-schema`,f.h("staff")]]){const r=await f.app.inject({url,headers:h});assert.equal(r.statusCode,503);assert.deepEqual(r.json(),{error:"PASSPORT_NOT_CONFIGURED"});}assert.equal((await f.app.inject({url:"/workspace",headers:f.h()})).statusCode,200);assert.equal(f.calls.length,0);
});
test("passport HTTP: HTTPS uses only existing Host-bound participant/staff realms",async t=>{
  const f=fixture({customOrigin:"https://example.test"});t.after(()=>f.app.close());assert.equal((await f.app.inject({url:"/api/v2/participant/passport",headers:f.h()})).statusCode,200);assert.equal((await f.app.inject({url:"/api/v2/participant/passport",headers:{...f.h(),cookie:"pedpsy_v2_demo="+own}})).statusCode,401);assert.equal((await f.app.inject({url:`/api/v2/staff/studies/${id}/passport-schema`,headers:f.h("staff")})).statusCode,200);
});
