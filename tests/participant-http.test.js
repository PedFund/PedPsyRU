"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const {createParticipantApp,readParticipantCookie}=require("../dist/src/http/participant-app.js");
const {ParticipationError}=require("../dist/src/ports/errors.js");
const {demoConfig}=require("../dist/src/bootstrap/demo-config.js");
function api(){return {denied:async()=>{},login:async()=>({token:"a".repeat(43),csrf:"synthetic-csrf",expiresAt:Date.now()+1800000}),session:async()=>({csrf:"synthetic-csrf",attempts:[]}),
  logout:async()=>{},form:async()=>({id:"form",version:"draft",items:[]}),
  read:async()=>({id:"attempt",status:"draft",revision:1,currentItemId:"q03",releaseId:"release",responses:[],private_password:"DO_NOT_SEND"}),
  save:async(_t,_id,_input,csrf)=>{if(csrf!=="synthetic-csrf")throw new ParticipationError(403,"CSRF_REJECTED");},
  complete:async()=>{},result:async()=>{throw new Error("synthetic private SQL statement");}};}
const origin="http://127.0.0.1:4174",headers={host:"127.0.0.1:4174",origin};
test("v2 cookie parser rejects duplicate/malformed/encoded/oversized capabilities",()=>{
  const token="a".repeat(43);assert.equal(readParticipantCookie("pedpsy_v2_demo="+token,"pedpsy_v2_demo"),token);
  for(const value of [undefined,"pedpsy_v2_demo=bad",`pedpsy_v2_demo=${token}; pedpsy_v2_demo=${token}`,"pedpsy_v2_demo=%61"+token,"x".repeat(2049)])assert.equal(readParticipantCookie(value,"pedpsy_v2_demo"),"");
});
test("v2 boundary rejects unsafe origin/config and protects HTTP cookies",async t=>{
  for(const bad of ["http://example.com","ftp://127.0.0.1","http://127.0.0.1:4174/path"])assert.throws(()=>createParticipantApp(api(),bad),/EXPLICIT_SAFE_ORIGIN_REQUIRED/);
  const app=createParticipantApp(api(),"https://example.test");t.after(()=>app.close());
  const r=await app.inject({method:"POST",url:"/api/v2/participant/login",headers:{host:"example.test",origin:"https://example.test"},payload:{}});
  assert.equal(r.statusCode,200);assert.match(r.headers["set-cookie"],/^__Host-pedpsy=/);assert.match(r.headers["set-cookie"],/HttpOnly; SameSite=Strict/);assert.match(r.headers["set-cookie"],/; Secure$/);assert.equal(r.body.includes("aaaaaaa"),false);
});
test("v2 origin/CSRF/JSON/size/media-type boundaries return neutral errors",async t=>{
  const app=createParticipantApp(api(),origin);t.after(()=>app.close());
  for(const h of [{host:headers.host},{...headers,origin:"https://foreign.test"},{...headers,"sec-fetch-site":"cross-site"},{...headers,host:"foreign.test"}])assert.equal((await app.inject({method:"POST",url:"/api/v2/participant/login",headers:h,payload:{}})).statusCode,403);
  assert.equal((await app.inject({method:"PUT",url:"/api/v2/participant/attempts/a/draft",headers,payload:{}})).statusCode,403);
  for(const [payload,type,status] of [["{broken","application/json",400],["x".repeat(9000),"application/json",413],["<private>","application/xml",415]]){
    const r=await app.inject({method:"POST",url:"/api/v2/participant/login",headers:{...headers,"content-type":type},payload});assert.equal(r.statusCode,status);assert.equal(r.body.includes("private"),false);
  }
});
test("v2 output whitelist and internal-error redaction never echo storage or route details",async t=>{
  const app=createParticipantApp(api(),origin);t.after(()=>app.close());
  const r=await app.inject({url:"/api/v2/participant/attempts/a",headers});assert.equal(r.statusCode,200);assert.equal(r.body.includes("DO_NOT_SEND"),false);assert.equal(r.headers["cache-control"],"no-store");assert.equal(r.headers["x-content-type-options"],"nosniff");
  const error=await app.inject({url:"/api/v2/participant/attempts/a/result",headers});assert.equal(error.statusCode,500);assert.deepEqual(error.json(),{error:"INTERNAL_ERROR"});
  const missing=await app.inject({url:"/methods/tki/keys/private",headers});assert.equal(missing.statusCode,404);assert.equal(missing.body.includes("private"),false);
});
test("v2 demo bootstrap refuses remote/real/owner config and performs no provisioning",()=>{
  const good={PEDPSY_PG_DEMO:"1",PGHOST:"127.0.0.1",PGPORT:"5432",PGDATABASE:"pedpsy_demo_0123456789abcdef",PGUSER:"pedpsy_runtime_0123456789abcdef",PGPASSWORD:"synthetic-not-a-secret"};
  assert.equal(demoConfig(good).max,4);
  for(const patch of [{PEDPSY_PG_DEMO:undefined},{PGHOST:"selectel.example"},{PGDATABASE:"production"},{PGUSER:"postgres"},{PGPASSWORD:undefined},{PGPORT:"80"}])assert.throws(()=>demoConfig({...good,...patch}),/EXPLICIT_SYNTHETIC_PG_CONFIG_REQUIRED/);
});
