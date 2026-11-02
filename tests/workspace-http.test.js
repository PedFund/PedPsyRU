"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict");
const {createWorkspaceApp,createWorkspacePreviewApp}=require("../dist/src/http/workspace-app.js");
const {workspaceAssets}=require("../dist/src/bootstrap/workspace-assets.js");
const {createAccountApi}=require("../dist/src/application/account-api.js");
const {ParticipationError}=require("../dist/src/ports/errors.js");
const {csrfFor,validToken,equalText}=require("../storage/access.js");
const assets={html:"<!doctype html><title>МетодТест</title>",js:"'use strict';",css:"body{}"};
const origin="http://127.0.0.1:4174",headers={host:"127.0.0.1:4174",origin};
function fixture(){const denied=[],pending="p".repeat(43),staff="s".repeat(43),researcher="r".repeat(43);
  const auth=()=>{throw new ParticipationError(401,"AUTH_REQUIRED");};
  const account=createAccountApi({access:{session:async t=>{if(t!==staff&&t!==researcher)auth();return {user_id:"synthetic",role:t===staff?"administrator":"researcher",session_version:1,expires_at:Date.now()+1800000};},check:async()=>{},denied:async(t,r)=>{denied.push([t,r]);}},
    auth:{password:async()=>({challenge:pending,status:"mfa_required",expiresAt:Date.now()+300000}),enroll:async()=>({secret:"synthetic-only",issuer:"PedPsy",account:"test"}),verify:async()=>({token:staff,csrf:csrfFor(staff),expiresAt:Date.now()+1800000}),logout:async()=>{}},
    researchers:{accept:async()=>{},login:async()=>({token:researcher,csrf:csrfFor(researcher),expiresAt:Date.now()+1800000}),home:async t=>{if(t!==researcher)auth();return {active_study_quota:1,studies:[]};},logout:async()=>{}},
    researcherManagement:{list:async t=>{if(t!==staff)auth();return [];},invite:async()=>({login_id:"SYNTHETIC",invite_code:"i".repeat(43),expires_at:Date.now()+86400000}),block:async()=>{}},
    staffManagement:{list:async()=>{throw new ParticipationError(403,"FORBIDDEN");},assign:async()=>{throw new ParticipationError(403,"FORBIDDEN");}},
    diagnostics:{list:async t=>{if(t!==staff)auth();return [];},read:async()=>{throw new Error("private SQL credentials");},download:async()=>({record_count:0,protocols:[]})}},
    {forToken:csrfFor,assert:(t,c)=>{if(!validToken(t)||!equalText(c,csrfFor(t)))throw new ParticipationError(403,"CSRF_REJECTED");}});
  const participant={denied:async(t,r)=>denied.push([t,r]),login:auth,session:auth,logout:auth,form:auth,read:auth,save:auth,complete:auth,result:auth};return {account,participant,denied,pending,staff,researcher};}
test("workspace assets are bounded, no-store, CSP protected; preview cannot authenticate",async t=>{
  const app=createWorkspacePreviewApp(assets);t.after(()=>app.close());
  const r=await app.inject({url:"/workspace"});assert.equal(r.statusCode,200);assert.match(r.body,/МетодТест/);assert.doesNotMatch(r.body,/ПедПси|ПЕДПСИ/);assert.equal(r.headers["cache-control"],"no-store");assert.match(r.headers["content-security-policy"],/frame-ancestors 'none'/);assert.match(r.headers["content-security-policy"],/script-src 'self'/);assert.equal(r.headers["referrer-policy"],"no-referrer");
  const actual=workspaceAssets();assert.match(actual.html,/Дизайн исследования/);assert.match(actual.html,/Сведения об участниках/);assert.doesNotMatch(actual.html+actual.js,/Перечитать дизайн|Что получится после обработки|Можно назначить участникам|href="https?:/);
  for(const url of ["/workspace/private","/storage/access.js","/methods/tki/keys"])assert.equal((await app.inject({url})).statusCode,404);
  assert.deepEqual((await app.inject({method:"POST",url:"/api/v2/staff/password",payload:{}})).json(),{error:"DATABASE_NOT_CONFIGURED"});
});
test("workspace separates pending/staff/researcher cookies and never returns bearer in JSON",async t=>{
  const f=fixture(),app=createWorkspaceApp(f.participant,f.account,origin,assets);t.after(()=>app.close());
  const p=await app.inject({method:"POST",url:"/api/v2/staff/password",headers,payload:{}});assert.equal(p.statusCode,200);assert.match(p.headers["set-cookie"],/pedpsy_pending_demo=.*HttpOnly; SameSite=Strict/);assert.ok(!p.body.includes(f.pending));
  assert.equal((await app.inject({url:"/api/v2/staff/session",headers:{...headers,cookie:"pedpsy_staff_demo="+f.pending}})).statusCode,401);
  const v=await app.inject({method:"POST",url:"/api/v2/staff/verify",headers:{...headers,cookie:"pedpsy_pending_demo="+f.pending,"x-pedpsy-csrf":p.json().csrf},payload:{type:"totp",code:"123456"}});assert.equal(v.statusCode,200);assert.ok(!v.body.includes(f.staff));assert.ok(v.headers["set-cookie"].some(x=>x.startsWith("pedpsy_researcher_demo=;")));
  const s=await app.inject({url:"/api/v2/staff/session",headers:{...headers,cookie:"pedpsy_staff_demo="+f.staff}});assert.ok(!s.json().permissions.includes("staff.roles.assign"));assert.ok(!s.json().permissions.includes("processing.manage"));
  const r=await app.inject({method:"POST",url:"/api/v2/researcher/login",headers,payload:{}});assert.equal(r.statusCode,200);assert.ok(!r.body.includes(f.researcher));assert.ok(r.headers["set-cookie"].some(x=>x.startsWith("pedpsy_staff_demo=;")));
});
test("workspace denies origin, CSRF, duplicate cookies, malformed export and unsafe media",async t=>{
  const f=fixture(),app=createWorkspaceApp(f.participant,f.account,origin,assets);t.after(()=>app.close());
  const h={...headers,cookie:"pedpsy_staff_demo="+f.staff,"x-pedpsy-csrf":csrfFor(f.staff)};
  assert.equal((await app.inject({method:"POST",url:"/api/v2/staff/export",headers:h,payload:{}})).statusCode,200);
  for(const bad of [{...h,origin:"https://other.test"},{...h,"sec-fetch-site":"cross-site"},{...h,"x-pedpsy-csrf":"wrong"},{...h,host:"other.test"}])assert.equal((await app.inject({method:"POST",url:"/api/v2/staff/export",headers:bad,payload:{}})).statusCode,403);
  for(const payload of [{role:"superadministrator"},{attempt_id:4},[]])assert.equal((await app.inject({method:"POST",url:"/api/v2/staff/export",headers:h,payload})).statusCode,400);
  assert.equal((await app.inject({url:"/api/v2/staff/export",headers:h})).statusCode,404);
  assert.equal((await app.inject({url:"/api/v2/staff/session",headers:{...h,cookie:`pedpsy_staff_demo=${f.staff}; pedpsy_staff_demo=${f.staff}`}})).statusCode,401);
  for(const [payload,type,status]of [["{broken","application/json",400],["x".repeat(9000),"application/json",413],["<private>","application/xml",415]])assert.equal((await app.inject({method:"POST",url:"/api/v2/staff/password",headers:{...h,"content-type":type},payload})).statusCode,status);
  assert.ok(f.denied.some(x=>x[1]==="CSRF_REJECTED"));assert.ok(f.denied.some(x=>x[1]==="ORIGIN_REJECTED"));
});
test("workspace HTTPS cookie settings, error redaction and audit fail closed",async t=>{
  const f=fixture(),app=createWorkspaceApp(f.participant,f.account,"https://example.test",assets);t.after(()=>app.close());
  const h={host:"example.test",origin:"https://example.test"};const p=await app.inject({method:"POST",url:"/api/v2/staff/password",headers:h,payload:{}});assert.match(p.headers["set-cookie"],/^__Host-pedpsy_pending=.*; Secure$/);
  const e=await app.inject({url:"/api/v2/staff/protocols/id",headers:h});assert.deepEqual(e.json(),{error:"INTERNAL_ERROR"});assert.equal(e.statusCode,500);
  f.account.denied=async()=>{throw new Error("audit failure private details");};const failed=await app.inject({method:"POST",url:"/api/v2/staff/export",headers:h,payload:{role:"invalid"}});assert.equal(failed.statusCode,500);assert.deepEqual(failed.json(),{error:"INTERNAL_ERROR"});
});
