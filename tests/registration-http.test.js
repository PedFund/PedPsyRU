"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict"),{randomBytes}=require("node:crypto");
const {createWorkspaceApp}=require("../dist/src/http/workspace-app.js"),{createRegistrationHttpApi}=require("../dist/src/application/registration-http-api.js"),{SignedRegistrationBrowser}=require("../dist/src/adapters/security/registration-browser.js"),{ParticipationError}=require("../dist/src/ports/errors.js");
const {csrfFor}=require("../storage/access.js");
const origin="http://127.0.0.1:4174",headers={host:"127.0.0.1:4174",origin},assets={html:"<!doctype html><title>Workspace</title>",js:"'use strict';",css:"body{}"};
const id="12345678-1234-1234-1234-123456789012",invite="i".repeat(43),confirmation="c".repeat(43),session="p".repeat(43),body={email:"HTTP.Owner@example.test",password:"synthetic HTTP password",contact_notice_version:"demo-contact-1",accept_contact_notice:true};
function fixture({enabled=true,customOrigin=origin,auditFailure=false}={}){
  const calls=[],audit=[],browser=new SignedRegistrationBrowser(randomBytes(32),customOrigin),deny=()=>{throw new ParticipationError(401,"AUTH_REQUIRED");};
  const core={landing:async()=>{},start:async(...a)=>{calls.push(["start",...a]);return {status:"confirmation_requested"};},confirm:async(...a)=>{calls.push(["confirm",...a]);return {status:"sign_in_required"};},login:async input=>{calls.push(["login",input]);return {token:session,csrf:csrfFor(session),expiresAt:Date.now()+1800000};}};
  const receipt={context:async()=>({study_id:id,study_title:"Synthetic",group_name:"КГ",contact_notice:{version:"demo-contact-1",text:"Synthetic only",legal_status:"synthetic_only"}}),receipt:async()=>({synthetic:true,confirmation_token:confirmation,expires_at:Date.now()+1800000})};
  const api=enabled?createRegistrationHttpApi(core,receipt,browser,{record:async reason=>{if(auditFailure)throw Error("private audit details");audit.push(reason);}}):undefined;
  const accounts={denied:async(t,r)=>audit.push([t,r]),password:async()=>({challenge:"s".repeat(43),status:"mfa_required",expiresAt:Date.now()+300000}),pendingCsrf:csrfFor};
  const participant={denied:async()=>{},login:deny,session:async token=>{if(token!==session)deny();return {role:"participant",attempts:[]};}};
  return {app:createWorkspaceApp(participant,accounts,customOrigin,assets,undefined,undefined,undefined,api),browser,calls,audit};
}
function cookie(r){return r.headers["set-cookie"].split(";")[0];}
async function preflight(f,h=headers){const r=await f.app.inject({url:"/api/v2/registration/preflight",headers:h});assert.equal(r.statusCode,200);return {response:r,headers:{...h,cookie:cookie(r),"x-pedpsy-csrf":r.json().csrf,"x-pedpsy-invite":invite}};}
test("registration HTTP: preflight/context are metadata only, dedicated cookie not a bearer in JSON; no secret URL/query",async t=>{
  const f=fixture();t.after(()=>f.app.close());const p=await preflight(f),nonce=p.headers.cookie.split("=")[1];assert.match(p.response.headers["set-cookie"],/^pedpsy_registration_demo=.*Path=\/; HttpOnly; SameSite=Strict; Max-Age=/);assert.ok(!p.response.body.includes(nonce));assert.equal(p.response.json().synthetic,true);assert.equal(f.calls.length,0);
  const ctx=await f.app.inject({url:"/api/v2/registration/context",headers:p.headers});assert.equal(ctx.statusCode,200);assert.equal(ctx.json().study_id,id);assert.ok(!ctx.body.includes(invite));assert.equal(f.calls.length,0);
  for(const url of ["/api/v2/registration/context?invite_token="+invite,"/api/v2/registration/preflight?role=superadministrator"])assert.equal((await f.app.inject({url,headers:p.headers})).statusCode,400);
  assert.equal((await f.app.inject({url:"/api/v2/registration/context",headers})).statusCode,404);assert.equal(p.response.headers["cache-control"],"no-store");assert.equal(ctx.headers["referrer-policy"],"no-referrer");
});
test("registration HTTP: explicit start/receipt/confirm/login separate; only login sets participant cookie, session token never JSON",async t=>{
  const f=fixture();t.after(()=>f.app.close());const p=await preflight(f),h=p.headers;
  const start=await f.app.inject({method:"POST",url:"/api/v2/registration/start",headers:h,payload:body});assert.deepEqual(start.json(),{status:"confirmation_requested"});assert.equal(start.headers["set-cookie"],undefined);
  const received=await f.app.inject({method:"POST",url:"/api/v2/registration/receipt",headers:h,payload:{}});assert.equal(received.statusCode,200);assert.deepEqual(Object.keys(received.json()).sort(),["confirmation_token","expires_at","synthetic"]);
  const c=await f.app.inject({method:"POST",url:"/api/v2/registration/confirm",headers:h,payload:{confirmation_token:confirmation}});assert.deepEqual(c.json(),{status:"sign_in_required"});assert.equal(c.headers["set-cookie"],undefined);
  const login=await f.app.inject({method:"POST",url:"/api/v2/registration/login",headers:h,payload:{study_id:id,email:body.email,password:body.password}});assert.equal(login.statusCode,200);assert.ok(!login.body.includes(session));assert.deepEqual(Object.keys(login.json()).sort(),["csrf","expires_at"]);assert.equal(login.headers["set-cookie"].length,2);assert.ok(login.headers["set-cookie"].some(x=>x.startsWith("pedpsy_v2_demo=")));assert.ok(login.headers["set-cookie"].some(x=>x.startsWith("pedpsy_registration_demo=;")));
  assert.deepEqual(f.calls.map(x=>x[0]),["start","confirm","login"]);for(const path of ["start","receipt","confirm","login"])assert.equal((await f.app.inject({url:"/api/v2/registration/"+path,headers:h})).statusCode,404);
});
test("registration HTTP: signed nonce/CSRF/Origin/SecFetch guards reject renamed staff, duplicate/missing cookies before ports",async t=>{
  const f=fixture();t.after(()=>f.app.close());const p=await preflight(f),h=p.headers,raw=h.cookie.split("=")[1],withoutOrigin={...h};delete withoutOrigin.origin;
  for(const bad of [{...h,origin:"https://other.test"},{...h,host:"other.test"},{...h,"sec-fetch-site":"cross-site"},withoutOrigin,
    {...h,cookie:"pedpsy_registration_demo="+"s".repeat(43),"x-pedpsy-csrf":csrfFor("s".repeat(43))},{...h,cookie:h.cookie+"; "+h.cookie},
    {...h,cookie:"pedpsy_pending_demo="+raw},{...h,"x-pedpsy-csrf":csrfFor(raw)},{...h,"x-pedpsy-csrf":"wrong"}]){
    const r=await f.app.inject({method:"POST",url:"/api/v2/registration/start",headers:bad,payload:body});assert.equal(r.statusCode,403);assert.ok(!r.body.includes(raw)&&!r.body.includes(body.password));
  }assert.equal(f.calls.length,0);assert.ok(f.audit.includes("CSRF_REJECTED")&&f.audit.includes("ORIGIN_REJECTED"));
});
test("registration HTTP: exact DTO/body caps/media and required denial audit fail closed without private echo",async t=>{
  const f=fixture();t.after(()=>f.app.close());const p=await preflight(f),h=p.headers;
  for(const [path,payload] of [["start",{...body,group_id:id}],["confirm",{confirmation_token:confirmation,password:body.password}],["receipt",{email:body.email}],["login",{study_id:id,email:body.email,password:body.password,role:"superadministrator"}]])assert.equal((await f.app.inject({method:"POST",url:"/api/v2/registration/"+path,headers:h,payload})).statusCode,400);
  for(const [payload,type,status]of [["{broken","application/json",400],["x".repeat(9000),"application/json",413],["<private>","application/xml",415]]){const r=await f.app.inject({method:"POST",url:"/api/v2/registration/start",headers:{...h,"content-type":type},payload});assert.equal(r.statusCode,status);assert.ok(!r.body.includes("private"));}assert.equal(f.calls.length,0);
  const failed=fixture({auditFailure:true});t.after(()=>failed.app.close());const r=await failed.app.inject({method:"POST",url:"/api/v2/registration/start",headers,payload:body});assert.equal(r.statusCode,500);assert.deepEqual(r.json(),{error:"INTERNAL_ERROR"});
});
test("registration HTTP: HTTPS Host cookies, reuse within lifetime, missing key disables only registration",async t=>{
  const f=fixture({customOrigin:"https://example.test"});t.after(()=>f.app.close());const h={host:"example.test",origin:"https://example.test"},p=await preflight(f,h);assert.match(p.response.headers["set-cookie"],/^__Host-pedpsy_registration=.*; Secure$/);
  const again=await f.app.inject({url:"/api/v2/registration/preflight",headers:p.headers});assert.ok(cookie(again)===p.headers.cookie,"valid preauth cookie rotated unexpectedly");assert.equal(again.json().csrf,p.response.json().csrf);
  const disabled=fixture({enabled:false});t.after(()=>disabled.app.close());for(const [method,path,payload]of [["GET","preflight",undefined],["GET","context",undefined],["POST","start",body],["POST","login",{}]]){const r=await disabled.app.inject({method,url:"/api/v2/registration/"+path,headers,payload});assert.equal(r.statusCode,503);assert.deepEqual(r.json(),{error:"REGISTRATION_NOT_CONFIGURED"});}
  assert.equal((await disabled.app.inject({method:"POST",url:"/api/v2/staff/password",headers,payload:{}})).statusCode,200);assert.ok(disabled.audit.every(x=>x[0]===""));
});
