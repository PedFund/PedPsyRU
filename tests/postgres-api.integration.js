"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const {randomBytes,randomUUID}=require("node:crypto");
const {postgresFixture}=require("./postgres-fixture.js");
const {responses}=require("./storage-contract-suite.js");
const {passwordRecord,derive}=require("../storage/access.js");
const {sha256}=require("../storage/database.js");
const {responsesDigest}=require("../storage/releases.js");
const {scoreTki}=require("../core/tki-contract.js");
const {PostgresUnitOfWork}=require("../dist/src/adapters/postgres/unit-of-work.js");
const {PostgresParticipantGateway}=require("../dist/src/adapters/postgres/identity.js");
const {createParticipationService}=require("../dist/src/application/participation.js");
const {createParticipantApi}=require("../dist/src/application/participant-api.js");
const {createParticipantApp}=require("../dist/src/http/participant-app.js");
const origin="http://127.0.0.1:4174",headers={host:"127.0.0.1:4174",origin};
async function fixture(t,derivePassword) {
  const f=await postgresFixture({runtimePoolSize:2});t.after(()=>f.close());
  const password=randomBytes(32).toString("base64url"),record=await passwordRecord(password);
  await f.admin.query("UPDATE pedpsy.participant_credentials SET salt=$1,password_hash=$2 WHERE id=$3",[record.salt,record.password_hash,f.credential]);
  let calculations=0;const uow=new PostgresUnitOfWork(f.runtime),identity=new PostgresParticipantGateway(f.runtime,uow,derivePassword);
  const service=createParticipationService(uow,{newId:randomUUID,now:()=>new Date().toISOString(),digest:(ids,values)=>responsesDigest(ids.map(item_id=>({item_id})),values),score:input=>{calculations++;return scoreTki(input);}});
  const api=createParticipantApi(identity,service),app=createParticipantApp(api,origin);t.after(()=>app.close());
  const attemptId=f.seed.studies[0].attempts[0].id;
  const login=async(payload={login_id:"SYNTHETIC-RLS",password})=>{
    const r=await app.inject({method:"POST",url:"/api/v2/participant/login",headers,payload});
    assert.equal(r.statusCode,200);assert.match(r.headers["set-cookie"],/HttpOnly; SameSite=Strict/);
    return {cookie:r.headers["set-cookie"].split(";")[0],csrf:r.json().csrf,body:r.json()};
  };
  const call=(path,session,method="GET",payload)=>app.inject({method,url:"/api/v2/participant"+path,headers:{...headers,...(session?{cookie:session.cookie,"x-pedpsy-csrf":session.csrf}:{})},...(payload===undefined?{}:{payload})});
  return {...f,password,uow,identity,api,app,attemptId,login,call,calculations:()=>calculations};
}
test("PostgreSQL API: partial/full TKI, reload/relogin and idempotent result keep original calculation",async t=>{
  const f=await fixture(t),session=await f.login(),path="/attempts/"+f.attemptId;
  const list=await f.call("/session",session);assert.equal(list.statusCode,200);assert.equal(list.json().attempts.length,3);
  const form=await f.call(path+"/form",session);assert.equal(form.statusCode,200);assert.equal(form.json().items.length,30);
  for(const forbidden of ["source_text","key_digest","password_hash","credential_id","provenance","audience"])assert.equal(form.body.includes(forbidden),false);
  const before=(await f.call(path,session)).json();
  const partial=await f.call(path+"/draft",session,"PUT",{expected_revision:before.revision,current_item_id:"q30",responses:responses().slice(0,29)});assert.equal(partial.statusCode,200);
  assert.equal((await f.call(path+"/complete",session,"POST",{expected_revision:partial.json().revision})).statusCode,422);
  const saved=await f.call(path+"/draft",session,"PUT",{expected_revision:partial.json().revision,current_item_id:"q30",responses:responses()});assert.equal(saved.statusCode,200);
  const completed=await f.call(path+"/complete",session,"POST",{expected_revision:saved.json().revision});assert.equal(completed.statusCode,200);
  const value=completed.json(),expected=scoreTki({contract_version:"1.0",method_version_id:"tki_ru_30_pairs@1.0.0",handler_version:"tki-contract-0.3.0",responses:responses()});
  assert.deepEqual(value.measures.map(m=>m.value),expected.measures.map(m=>m.value));assert.equal(f.calculations(),1);
  assert.deepEqual((await f.call(path+"/result",session)).json(),value);
  assert.deepEqual((await f.call(path+"/complete",session,"POST",{expected_revision:saved.json().revision})).json(),value);
  assert.equal((await f.call(path+"/draft",session,"PUT",{expected_revision:saved.json().revision,current_item_id:"q01",responses:[]})).statusCode,409);
  const loggedOut=await f.call("/logout",session,"POST",{});assert.equal(loggedOut.statusCode,200);assert.match(loggedOut.headers["set-cookie"],/Max-Age=0/);
  assert.equal((await f.call(path+"/result",session)).statusCode,401);
  const again=await f.login();assert.deepEqual((await f.call(path+"/result",again)).json(),value);assert.equal(f.calculations(),1);
  assert.equal((await f.admin.query("SELECT count(*)::integer n FROM pedpsy.attempt_results")).rows[0].n,1);
  const freshUow=new PostgresUnitOfWork(f.runtime);
  const secondApp=createParticipantApp(createParticipantApi(new PostgresParticipantGateway(f.runtime,freshUow),createParticipationService(freshUow,
    {newId:randomUUID,now:()=>new Date().toISOString(),digest:(ids,values)=>responsesDigest(ids.map(item_id=>({item_id})),values),score:()=>assert.fail("stored result must not be recalculated")})),origin);
  // Recreated identity/session endpoint survives application object replacement.
  try {
    assert.equal((await secondApp.inject({url:"/api/v2/participant/session",headers:{...headers,cookie:again.cookie}})).json().attempts.find(a=>a.id===f.attemptId).status,"completed");
    assert.deepEqual((await secondApp.inject({url:"/api/v2/participant"+path+"/result",headers:{...headers,cookie:again.cookie}})).json(),value);
  }finally{await secondApp.close();}
});
test("PostgreSQL API: foreign/cross-study/missing IDs, anonymous and staff stay isolated",async t=>{
  const f=await fixture(t),session=await f.login();
  const ids=[f.seed.studies[0].attempts.find(a=>a.participant_id!==f.participant.id).id,f.seed.studies[1].attempts[0].id,randomUUID(),"not-a-uuid"];
  for(const id of ids)for(const suffix of ["","/form","/result"]){const r=await f.call("/attempts/"+id+suffix,session);assert.equal(r.statusCode,404);assert.deepEqual(r.json(),{error:"NOT_AVAILABLE"});}
  assert.equal((await f.call("/attempts/"+f.attemptId)).statusCode,401);
  const credential=randomUUID(),raw=randomBytes(32).toString("base64url"),at=Date.now();
  await f.admin.query("INSERT INTO pedpsy.staff_credentials(id,user_id,login_id,role,scheme,salt,password_hash) VALUES($1,$2,'SYNTHETIC-STAFF','superadministrator','scrypt-N131072-r8-p1-dk64',$3,$4)",[credential,f.seed.user_id,randomBytes(16).toString("hex"),randomBytes(64).toString("hex")]);
  await f.admin.query("INSERT INTO pedpsy.staff_sessions(token_hash,credential_id,user_id,role,credential_version,created_at_ms,last_seen_at_ms,expires_at_ms,mfa_verified_at) VALUES($1,$2,$3,'superadministrator',1,$4,$4,$5,to_timestamp($4::double precision/1000))",[sha256(raw),credential,f.seed.user_id,at,at+1800000]);
  assert.equal((await f.call("/session",{cookie:"pedpsy_v2_demo="+raw})).statusCode,401);
  const spoof=await f.app.inject({url:"/api/v2/participant/attempts/"+ids[0],headers:{...headers,cookie:session.cookie,"x-role":"superadministrator","x-study-id":f.seed.studies[1].id}});assert.equal(spoof.statusCode,404);
  for(const url of ["/api/v2/admin/export","/api/v2/researcher/results","/methods/tki/keys/1.0.0.json"])assert.equal((await f.app.inject({url,headers:{...headers,cookie:session.cookie}})).statusCode,404);
});
test("PostgreSQL API: same-origin/CSRF and strict client DTOs prevent unauthorized mutation",async t=>{
  const f=await fixture(t),session=await f.login(),path="/attempts/"+f.attemptId;
  const before=(await f.call(path,session)).json(),input={expected_revision:before.revision,current_item_id:"q08",responses:responses()};
  for(const patch of [{origin:"https://foreign.test"},{"x-pedpsy-csrf":"bad"},{"sec-fetch-site":"cross-site"}]){
    const r=await f.app.inject({method:"PUT",url:"/api/v2/participant"+path+"/draft",headers:{...headers,cookie:session.cookie,"x-pedpsy-csrf":session.csrf,...patch},payload:input});assert.equal(r.statusCode,403);
  }
  for(const data of [{...input,role:"superadministrator"},{...input,scores:[12,12]},{...input,expected_revision:-1},{...input,responses:[{item_id:"q01",value:"C"}]}])assert.equal((await f.call(path+"/draft",session,"PUT",data)).statusCode,400);
  assert.deepEqual((await f.call(path,session)).json(),before);
  assert.equal((await f.call("/login",undefined,"POST",{login_id:"SYNTHETIC-RLS",password:f.password,role:"administrator"})).statusCode,400);
  assert.equal((await f.call("/logout",{...session,csrf:"bad"},"POST",{})).statusCode,403);
  assert.equal((await f.call(path,session)).statusCode,200);
});
test("PostgreSQL API: uniform invalid login and persisted throttle across new gateway",async t=>{
  const f=await fixture(t);
  for(const login_id of ["UNKNOWN-CODE","SYNTHETIC-RLS"]){const r=await f.call("/login",undefined,"POST",{login_id,password:"synthetic-wrong-password"});assert.equal(r.statusCode,401);assert.deepEqual(r.json(),{error:"INVALID_LOGIN"});}
  const code="SYNTHETIC-THROTTLE";
  for(let i=0;i<5;i++)assert.equal((await f.call("/login",undefined,"POST",{login_id:code,password:f.password})).statusCode,401);
  const recreated=new PostgresParticipantGateway(f.runtime,new PostgresUnitOfWork(f.runtime));await assert.rejects(recreated.login({login_id:code,password:f.password}),e=>e.code==="LOGIN_THROTTLED");
  await f.admin.query("UPDATE pedpsy.participant_credentials SET status='revoked',version=version+1 WHERE id=$1",[f.credential]);
  const revoked=await f.call("/login",undefined,"POST",{login_id:"SYNTHETIC-RLS",password:f.password});assert.equal(revoked.statusCode,401);assert.deepEqual(revoked.json(),{error:"INVALID_LOGIN"});
});
test("PostgreSQL API: revocation during password derivation cannot create session",async t=>{
  let entered,release;const barrier=new Promise(r=>{entered=r;}),wait=new Promise(r=>{release=r;});
  const f=await fixture(t,async(...args)=>{entered();await wait;return derive(...args);});
  const pending=f.identity.login({login_id:"SYNTHETIC-RLS",password:f.password});const assertion=assert.rejects(pending,e=>e.code==="INVALID_LOGIN");
  await barrier;await f.admin.query("UPDATE pedpsy.participant_credentials SET status='revoked',version=version+1 WHERE id=$1",[f.credential]);release();await assertion;
  assert.equal((await f.admin.query("SELECT count(*)::integer n FROM pedpsy.participant_sessions")).rows[0].n,1);
});
test("PostgreSQL API: audit failure rolls back complete and login rotation, no secrets in denial",async t=>{
  const f=await fixture(t),session=await f.login(),path="/attempts/"+f.attemptId;
  const before=(await f.call(path,session)).json(),saved=(await f.call(path+"/draft",session,"PUT",{expected_revision:before.revision,current_item_id:"q30",responses:responses()})).json();
  await f.admin.query("CREATE FUNCTION pedpsy.synthetic_api_audit_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action IN ('attempt_completed','participant_login') AND NEW.outcome='allow' THEN RAISE EXCEPTION 'synthetic audit failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER synthetic_api_audit_failure BEFORE INSERT ON pedpsy.access_audit_events FOR EACH ROW EXECUTE FUNCTION pedpsy.synthetic_api_audit_fail()");
  const r=await f.call(path+"/complete",session,"POST",{expected_revision:saved.revision});assert.equal(r.statusCode,500);assert.deepEqual(r.json(),{error:"INTERNAL_ERROR"});
  assert.equal((await f.admin.query("SELECT count(*)::integer n FROM pedpsy.attempt_results")).rows[0].n,0);assert.deepEqual((await f.call(path,session)).json(),saved);
  const count=(await f.admin.query("SELECT count(*)::integer n FROM pedpsy.participant_sessions")).rows[0].n;
  const login=await f.call("/login",undefined,"POST",{login_id:"SYNTHETIC-RLS",password:f.password});assert.equal(login.statusCode,500);assert.equal(login.headers["set-cookie"],undefined);
  assert.equal((await f.admin.query("SELECT count(*)::integer n FROM pedpsy.participant_sessions")).rows[0].n,count);assert.equal((await f.call(path,session)).statusCode,200);
  const audit=await f.admin.query("SELECT action,outcome,reason FROM pedpsy.access_audit_events");const text=JSON.stringify(audit.rows);assert.equal(text.includes(f.password),false);assert.equal(text.includes(session.csrf),false);
});
test("PostgreSQL API: idle/absolute expiry and pool context isolation remain fail closed",async t=>{
  const f=await fixture(t),session=await f.login();const raw=session.cookie.split("=")[1],at=Date.now();
  for(const [created,last,expiry] of [[at-700000,at-610000,at+1800000],[at-1800000,at-100,at-1]]){
    await f.admin.query("UPDATE pedpsy.participant_sessions SET created_at_ms=$1,last_seen_at_ms=$2,expires_at_ms=$3 WHERE token_hash=$4",[created,last,expiry,sha256(raw)]);
    assert.equal((await f.call("/session",session)).statusCode,401);
  }
  const a=await f.runtime.connect(),b=await f.runtime.connect();try{
    assert.equal((await a.query("SELECT * FROM pedpsy.attempts")).rowCount,0);assert.equal((await b.query("SELECT * FROM pedpsy.attempts")).rowCount,0);
    await assert.rejects(a.query("SELECT * FROM pedpsy.participant_credentials"),/permission denied/);
  }finally{a.release();b.release();}
});
test("PostgreSQL API: actual loopback HTTP login/save/complete/result persists original TKI",async t=>{
  const f=await fixture(t);await f.app.listen({host:"127.0.0.1",port:4174});
  const login=await fetch(origin+"/api/v2/participant/login",{method:"POST",headers:{origin,"content-type":"application/json"},body:JSON.stringify({login_id:"SYNTHETIC-RLS",password:f.password})});assert.equal(login.status,200);
  const session=await login.json(),cookie=login.headers.get("set-cookie").split(";")[0],h={origin,cookie,"content-type":"application/json","x-pedpsy-csrf":session.csrf};
  const base=origin+"/api/v2/participant/attempts/"+f.attemptId;
  const before=await (await fetch(base,{headers:h})).json();
  const save=await fetch(base+"/draft",{method:"PUT",headers:h,body:JSON.stringify({expected_revision:before.revision,current_item_id:"q30",responses:responses()})});assert.equal(save.status,200);const saved=await save.json();
  const complete=await fetch(base+"/complete",{method:"POST",headers:h,body:JSON.stringify({expected_revision:saved.revision})});assert.equal(complete.status,200);const result=await complete.json();
  assert.equal(result.measures.length,5);assert.equal(result.measures.reduce((n,m)=>n+m.value,0),30);assert.deepEqual(await(await fetch(base+"/result",{headers:h})).json(),result);
});
