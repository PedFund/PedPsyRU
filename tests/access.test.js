"use strict";

const {test,before} = require("node:test");
const assert=require("node:assert/strict");
const {randomUUID,randomBytes}=require("node:crypto");
const {spawnSync}=require("node:child_process");
const path=require("node:path");
const {mkdtempSync,rmSync}=require("node:fs");
const {tmpdir}=require("node:os");
const {openDatabase,migrate,sha256}=require("../storage/database.js");
const {importTkiRelease}=require("../storage/releases.js");
const {seedTraining}=require("../storage/seed.js");
const {createParticipantAccess,passwordRecord,SCHEME,SESSION_TTL_MS,IDLE_TTL_MS,LOGIN_WINDOW_MS,LOGIN_LIMIT}=require("../storage/access.js");
const {createDemoServer}=require("../web/server.js");
const {COOKIE,cookieToken}=require("../web/access-routes.js");
const PASSWORD="synthetic-test-only-password-27";
let records;
before(async()=>{records=[];for(let i=0;i<3;i++)records.push(await passwordRecord(PASSWORD));});

async function setup(t,{server=true,filename=":memory:"}={}) {
  const db=openDatabase(filename);migrate(db);const releaseId=importTkiRelease(db);const manifest=seedTraining(db,releaseId);
  let clock=Date.UTC(2026,9,2,12,0,0);const now=()=>clock;
  const actors=[{study:manifest.studies[0],index:0,login_id:"S1-DEMO-001"},
    {study:manifest.studies[0],index:1,login_id:"S1-DEMO-002"},{study:manifest.studies[1],index:0,login_id:"S2-DEMO-001"}];
  actors.forEach((actor,i)=>{
    actor.participant=actor.study.participants[actor.index];actor.credential_id=randomUUID();
    db.prepare("INSERT INTO participant_credentials(id,study_id,participant_id,login_id,scheme,salt,password_hash) VALUES(?,?,?,?,?,?,?)")
      .run(actor.credential_id,actor.study.id,actor.participant.id,actor.login_id,records[i].scheme,records[i].salt,records[i].password_hash);
    actor.attempt=actor.study.attempts.find(a=>a.participant_id===actor.participant.id);
  });
  const service=createParticipantAccess(db,{now});
  const state={db,service,actors,manifest,releaseId,advance:ms=>{clock+=ms;},now};
  if(!server){t.after(()=>{if(db.isOpen)db.close();});return state;}
  const http=createDemoServer({access:service});
  await new Promise((resolve,reject)=>{http.once("error",reject);http.listen(0,"127.0.0.1",resolve);});
  t.after(async()=>{http.closeAllConnections();await new Promise(resolve=>http.close(resolve));if(db.isOpen)db.close();});
  const base="http://127.0.0.1:"+http.address().port;
  state.base=base;
  state.login=async(actor=actors[0],headers={},input={login_id:actor.login_id,password:PASSWORD})=>{
    const response=await fetch(base+"/api/auth/login",{method:"POST",headers:{Origin:base,"Content-Type":"application/json",...headers},body:JSON.stringify(input)});
    const data=await response.json();const setCookie=response.headers.get("set-cookie");
    return {response,data,cookie:setCookie?.split(";")[0],token:setCookie?.split(";")[0].split("=")[1]};
  };
  state.get=(url,cookie,headers={})=>fetch(base+url,{headers:{...(cookie?{Cookie:cookie}:{}),...headers}});
  return state;
}

test("credentials are salted scrypt hashes; local issuance creates no global account or raw password",async t=>{
  const {db,service,manifest}=await setup(t,{server:false});
  const p=manifest.studies[0].participants[2],study=manifest.studies[0];
  await service.provision({study_id:study.id,participant_id:p.id,login_id:"S1-DEMO-003",password:PASSWORD});
  const row=db.prepare("SELECT * FROM participant_credentials WHERE login_id='S1-DEMO-003'").get();
  assert.equal(row.scheme,SCHEME);assert.equal(row.salt.length,32);assert.equal(row.password_hash.length,128);
  assert.notEqual(row.salt,records[0].salt);assert.notEqual(row.password_hash,records[0].password_hash);
  assert.equal(JSON.stringify(row).includes(PASSWORD),false);
  assert.equal(db.prepare("SELECT count(*) AS n FROM users").get().n,1);
  assert.throws(()=>db.prepare("UPDATE participant_credentials SET participant_id=? WHERE id=?").run(study.participants[0].id,row.id),/frozen/);
  assert.throws(()=>db.prepare("INSERT OR REPLACE INTO participant_credentials SELECT * FROM participant_credentials WHERE id=?").run(row.id),/already exists/);
});
test("credential/session scope is enforced by composite FK",async t=>{
  const {db,actors}=await setup(t,{server:false});
  const [a,,other]=actors;
  assert.throws(()=>db.prepare("INSERT INTO participant_credentials(id,study_id,participant_id,login_id,scheme,salt,password_hash) VALUES(?,?,?,?,?,?,?)")
    .run(randomUUID(),a.study.id,other.study.participants[2].id,"S1-FOREIGN",SCHEME,records[0].salt,records[0].password_hash),/FOREIGN KEY/);
  assert.throws(()=>db.prepare(`INSERT INTO participant_sessions(token_hash,credential_id,study_id,participant_id,credential_version,created_at_ms,last_seen_at_ms,expires_at_ms)
    VALUES(?,?,?,?,1,1,1,1000)`).run(sha256("invalid scope"),a.credential_id,a.study.id,other.participant.id),/FOREIGN KEY/);
});
test("anonymous/forged bearer/guessed code cannot read sessions, attempts or privileged endpoints",async t=>{
  const {actors,get}=await setup(t);
  for(const url of ["/api/auth/session","/api/participant/attempts","/api/participant/attempts/"+actors[0].attempt.id,"/api/participant/export"]){
    const response=await get(url,null,{Authorization:"Bearer fabricated.admin.jwt"});
    assert.equal(response.status,401);assert.deepEqual(await response.json(),{error:"AUTH_REQUIRED"});
  }
  const byCode=await get("/api/participant/attempts/DEMO-001",COOKIE+"=DEMO-001");assert.equal(byCode.status,401);
});
test("successful HTTP login sets bounded HttpOnly Strict cookie; secret stored only hashed",async t=>{
  const {db,login,get}=await setup(t);const signed=await login();assert.equal(signed.response.status,200);
  const cookie=signed.response.headers.get("set-cookie");
  assert.match(cookie,/HttpOnly/);assert.match(cookie,/SameSite=Strict/);assert.match(cookie,/Max-Age=1800/);assert.doesNotMatch(cookie,/Domain=/);
  assert.match(signed.token,/^[A-Za-z0-9_-]{43}$/);
  assert.equal(JSON.stringify(signed.data).includes(signed.token),false);
  const stored=db.prepare("SELECT * FROM participant_sessions").get();assert.equal(stored.token_hash,sha256(signed.token));
  assert.equal(JSON.stringify(stored).includes(signed.token),false);
  const session=await (await get("/api/auth/session",signed.cookie)).json();assert.equal(session.role,"participant");assert.equal(session.display_code,"DEMO-001");
  assert.equal(session.csrf_token,signed.data.csrf_token);
});
test("own participant sees only own attempts and answers, not keys, scores or digests",async t=>{
  const {actors,login,get}=await setup(t);const signed=await login();
  const list=await (await get("/api/participant/attempts",signed.cookie)).json();assert.equal(list.attempts.length,3);
  assert.ok(list.attempts.every(a=>actors[0].study.attempts.some(x=>x.id===a.attempt_id && x.participant_id===actors[0].participant.id)));
  const response=await get("/api/participant/attempts/"+actors[0].attempt.id,signed.cookie);assert.equal(response.status,200);
  const body=await response.json();assert.deepEqual(body.attempt.responses,[{item_id:"q01",value:"A"},{item_id:"q02",value:"B"}]);
  for(const denied of ["password_hash","token_hash","key_digest","responses_digest","source_text","measures","scales"])assert.equal(JSON.stringify(body).includes(denied),false);
});
test("same-study and cross-study IDs get exactly the same denial as absent IDs",async t=>{
  const {actors,login,get}=await setup(t);const signed=await login();
  for(const id of [actors[1].attempt.id,actors[2].attempt.id,randomUUID(),"not-an-id"]){
    const response=await get("/api/participant/attempts/"+id,signed.cookie);
    assert.equal(response.status,404);assert.deepEqual(await response.json(),{error:"NOT_AVAILABLE"});
  }
});
test("repeat login rotates session but returns the same study attempts without duplicate records",async t=>{
  const {db,login,get}=await setup(t);const first=await login();
  const before=await (await get("/api/participant/attempts",first.cookie)).json();
  const second=await login(undefined,{Cookie:first.cookie});assert.equal(second.response.status,200);assert.notEqual(second.token,first.token);
  assert.equal((await get("/api/auth/session",first.cookie)).status,401);
  const after=await (await get("/api/participant/attempts",second.cookie)).json();assert.deepEqual(after,before);
  assert.equal(db.prepare("SELECT count(*) AS n FROM attempts").get().n,18);
});
test("login cannot assign study/participant/admin role via body, query, headers or forged cookie",async t=>{
  const {actors,login,get}=await setup(t);
  for(const extra of [{role:"superadministrator"},{study_id:actors[2].study.id},{participant_id:actors[1].participant.id}]){
    const result=await login(undefined,{}, {login_id:actors[0].login_id,password:PASSWORD,...extra});assert.equal(result.response.status,400);
  }
  const signed=await login();
  assert.equal((await get("/api/participant/attempts?role=administrator",signed.cookie)).status,400);
  assert.equal((await get("/api/participant/attempts/"+actors[1].attempt.id,signed.cookie,{"X-Role":"administrator","X-Participant-ID":actors[1].participant.id})).status,404);
  for(const role of ["researcher","administrator","superadministrator"]){
    const response=await get("/api/participant/export",COOKIE+"="+role);assert.equal(response.status,401);
  }
});
test("incorrect password, unknown code and revoked credential share invalid-login response",async t=>{
  const {service,actors,login}=await setup(t);
  let response=await login(undefined,{}, {login_id:actors[0].login_id,password:"wrong-synthetic-password"});assert.equal(response.response.status,401);
  assert.deepEqual(response.data,{error:"INVALID_LOGIN"});
  response=await login(undefined,{}, {login_id:"S1-NOT-EXISTING",password:PASSWORD});assert.equal(response.response.status,401);assert.deepEqual(response.data,{error:"INVALID_LOGIN"});
  service.revoke(actors[0].login_id);response=await login();assert.equal(response.response.status,401);assert.deepEqual(response.data,{error:"INVALID_LOGIN"});
});
test("idle and absolute expiration reject sessions even with an otherwise valid cookie",async t=>{
  const {login,get,advance}=await setup(t);const first=await login();advance(IDLE_TTL_MS);
  assert.equal((await get("/api/auth/session",first.cookie)).status,401);
  const second=await login();
  for(let i=0;i<3;i++){advance(IDLE_TTL_MS-1);assert.equal((await get("/api/auth/session",second.cookie)).status,200);}
  advance(3);assert.equal((await get("/api/auth/session",second.cookie)).status,401);
  assert.equal(SESSION_TTL_MS,30*60*1000);
});
test("revoke and exclusions are checked on every request, not only at login",async t=>{
  const {db,service,actors,login,get}=await setup(t);const signed=await login();
  db.prepare("UPDATE participants SET status='excluded' WHERE id=?").run(actors[0].participant.id);
  assert.equal((await get("/api/participant/attempts",signed.cookie)).status,401);
  db.prepare("UPDATE participants SET status='active' WHERE id=?").run(actors[0].participant.id);
  service.revoke(actors[0].login_id);assert.equal((await get("/api/auth/session",signed.cookie)).status,401);
  assert.equal(db.prepare("SELECT revoked_at_ms FROM participant_sessions WHERE token_hash=?").get(sha256(signed.token)).revoked_at_ms!==null,true);
});
test("closed study, excluded enrollment, closed assignment/group/stage remove access",async t=>{
  const {db,actors,login,get}=await setup(t);const a=actors[0],signed=await login();
  const cases=[["stage_enrollments",a.attempt.enrollment_id,"excluded"],["assignments",a.attempt.assignment_id,"closed"],
    ["research_groups",a.attempt.group_id,"closed"],["research_stages",a.attempt.stage_id,"closed"]];
  for(const [table,id,status] of cases){
    db.prepare(`UPDATE ${table} SET status=? WHERE id=?`).run(status,id);
    const response=await get("/api/participant/attempts/"+a.attempt.id,signed.cookie);assert.equal(response.status,404);
    db.prepare(`UPDATE ${table} SET status='active' WHERE id=?`).run(id);
  }
  db.prepare("UPDATE studies SET status='closed' WHERE id=?").run(a.study.id);
  assert.equal((await get("/api/auth/session",signed.cookie)).status,401);
});
test("logout requires same-origin and session-bound CSRF; revoked cookie cannot be reused",async t=>{
  const {base,login,get}=await setup(t);const signed=await login();
  for(const headers of [{Origin:base},{Origin:"https://other.example","X-CSRF-Token":signed.data.csrf_token},
    {Origin:base,"X-CSRF-Token":"wrong"},{Origin:base,"X-CSRF-Token":"é".repeat(43)}]){
    const response=await fetch(base+"/api/auth/logout",{method:"POST",headers:{Cookie:signed.cookie,...headers}});
    assert.equal(response.status,403);assert.equal((await get("/api/auth/session",signed.cookie)).status,200);
  }
  const response=await fetch(base+"/api/auth/logout",{method:"POST",headers:{Cookie:signed.cookie,Origin:base,"X-CSRF-Token":signed.data.csrf_token}});
  assert.equal(response.status,200);assert.match(response.headers.get("set-cookie"),/Max-Age=0/);
  assert.equal((await get("/api/auth/session",signed.cookie)).status,401);
});
test("login CSRF, invalid JSON, oversized body and content type are rejected without echo",async t=>{
  const {base,login}=await setup(t);
  assert.equal((await login(undefined,{Origin:"https://other.example"})).response.status,403);
  assert.equal((await login(undefined,{Origin:"null"})).response.status,403);
  const missing=await fetch(base+"/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({login_id:"S1-DEMO-001",password:PASSWORD})});assert.equal(missing.status,403);
  for(const [headers,body,status] of [[{"Content-Type":"application/json"},"bad json",400],[{"Content-Type":"text/plain"},PASSWORD,415],[{"Content-Type":"application/json"},"x".repeat(2049),413]]){
    const response=await fetch(base+"/api/auth/login",{method:"POST",headers:{Origin:base,...headers},body});assert.equal(response.status,status);assert.equal((await response.text()).includes(PASSWORD),false);
  }
});
test("persistent login throttle survives service recreation and releases after its window",async t=>{
  const {db,service,actors,now,advance}=await setup(t,{server:false});
  for(let i=0;i<LOGIN_LIMIT;i++)assert.equal(await service.login({login_id:actors[0].login_id,password:"wrong-synthetic-password"}),null);
  const recreated=createParticipantAccess(db,{now});
  await assert.rejects(()=>recreated.login({login_id:actors[0].login_id,password:PASSWORD}),error=>error.status===429);
  advance(LOGIN_WINDOW_MS);assert.ok(await recreated.login({login_id:actors[0].login_id,password:PASSWORD}));
});
test("password reset invalidates old sessions/password without deleting attempts",async t=>{
  const {db,service,actors,login,get}=await setup(t);const old=await login();const replacement="different-synthetic-password-28";
  await service.resetPassword(actors[0].login_id,replacement);
  assert.equal((await get("/api/auth/session",old.cookie)).status,401);
  assert.equal((await login()).response.status,401);
  assert.equal((await login(undefined,{}, {login_id:actors[0].login_id,password:replacement})).response.status,200);
  assert.equal(db.prepare("SELECT count(*) AS n FROM attempts").get().n,18);
  const audit=db.prepare("SELECT * FROM access_audit_events").all();assert.equal(JSON.stringify(audit).includes(replacement),false);
});
test("revocation during password hashing cannot create a session",async t=>{
  const {db,service,actors}=await setup(t,{server:false});
  const pending=service.login({login_id:actors[0].login_id,password:PASSWORD});
  service.revoke(actors[0].login_id);assert.equal(await pending,null);
  assert.equal(db.prepare("SELECT count(*) AS n FROM participant_sessions").get().n,0);
});
test("01д.3 permits no answer mutation, completion, individual report or privileged export",async t=>{
  const {db,actors,login,base,get}=await setup(t);const signed=await login();
  const before=db.prepare("SELECT * FROM responses ORDER BY attempt_id,item_id").all();
  for(const method of ["POST","PUT","PATCH","DELETE"]){
    const response=await fetch(base+"/api/participant/attempts/"+actors[0].attempt.id,{method,headers:{Cookie:signed.cookie,Origin:base,"Content-Type":"application/json"},body:JSON.stringify({role:"administrator",responses:[{item_id:"q01",value:"B"}]})});assert.equal(response.status,405);
  }
  for(const url of ["/api/participant/attempts/"+actors[0].attempt.id+"/result","/api/participant/export","/api/participant/aggregates"])assert.equal((await get(url,signed.cookie)).status,404);
  assert.deepEqual(db.prepare("SELECT * FROM responses ORDER BY attempt_id,item_id").all(),before);
});
test("audit contains metadata only and is append-only, including denial without foreign-data existence",async t=>{
  const {db,actors,login,get}=await setup(t);const signed=await login();await get("/api/participant/attempts/"+actors[1].attempt.id,signed.cookie);
  const rows=db.prepare("SELECT * FROM access_audit_events").all();const json=JSON.stringify(rows);
  assert.ok(rows.some(row=>row.outcome==="deny"));
  for(const secret of [PASSWORD,signed.token,signed.data.csrf_token,"q01","password_hash","responses","measures"])assert.equal(json.includes(secret),false);
  assert.throws(()=>db.prepare("UPDATE access_audit_events SET reason='edited'").run(),/append only/);
  assert.throws(()=>db.prepare("DELETE FROM access_audit_events").run(),/append only/);
});
test("cookie parser rejects duplicate, malformed and oversized credential headers",()=>{
  assert.equal(cookieToken(COOKIE+"=abc; "+COOKIE+"=def"),null);
  assert.equal(cookieToken("x=1; "+COOKIE+"=abc"),"abc");assert.equal(cookieToken("x="+"a".repeat(4096)),null);
  assert.equal(cookieToken(undefined),null);
});
test("session hash and participant scope survive closing and reopening the database",async t=>{
  const directory=mkdtempSync(path.join(tmpdir(),"pedpsy-access-test-"));
  const filename=path.join(directory,"training.sqlite");
  const {db,service,actors,now}=await setup(t,{server:false,filename});
  const signed=await service.login({login_id:actors[0].login_id,password:PASSWORD});
  const before=service.list(signed.token);db.close();
  const reopened=openDatabase(filename);t.after(()=>reopened.close());
  t.after(()=>{assert.equal(path.dirname(directory),path.resolve(tmpdir()));assert.ok(path.basename(directory).startsWith("pedpsy-access-test-"));rmSync(directory,{recursive:true,force:true});});
  assert.equal(migrate(reopened),0);
  const restored=createParticipantAccess(reopened,{now});assert.deepEqual(restored.list(signed.token),before);
  restored.revoke(actors[0].login_id);assert.throws(()=>restored.session(signed.token),error=>error.status===401);
});
test("credential CLI refuses logging/noninteractive secret output before any database write",()=>{
  const child=spawnSync(process.execPath,[path.join(__dirname,"../storage/access-cli.js"),"issue","1","DEMO-001"],{encoding:"utf8"});
  assert.equal(child.status,1);assert.equal(child.stdout,"");assert.match(child.stderr,/interactive terminal/);
});
test("authenticated endpoints fail closed when database/access is not configured",async t=>{
  const server=createDemoServer();await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
  const response=await fetch("http://127.0.0.1:"+server.address().port+"/api/auth/session");assert.equal(response.status,503);
  assert.deepEqual(await response.json(),{error:"ACCESS_NOT_CONFIGURED"});
});
