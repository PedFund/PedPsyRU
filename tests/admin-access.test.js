"use strict";
const {test,before}=require("node:test");
const assert=require("node:assert/strict");
const {randomUUID}=require("node:crypto");
const {spawnSync}=require("node:child_process");
const path=require("node:path");
const {openDatabase,migrate,sha256}=require("../storage/database.js");
const {importTkiRelease}=require("../storage/releases.js");
const {seedTraining}=require("../storage/seed.js");
const {createParticipantAccess,passwordRecord,IDLE_TTL_MS,SESSION_TTL_MS,LOGIN_WINDOW_MS,LOGIN_LIMIT}=require("../storage/access.js");
const {createAdminAccess,EXPORT_LIMIT}=require("../storage/admin-access.js");
const {POLICY,IMPLEMENTED,permits}=require("../storage/roles.js");
const {createDemoServer}=require("../web/server.js");
const {COOKIE,cookieToken}=require("../web/admin-routes.js");
const PASSWORD="synthetic-staff-test-password-27";let record;
before(async()=>{record=await passwordRecord(PASSWORD);});
async function setup(t,{server=true}={}) {
  const db=openDatabase();migrate(db);const releaseId=importTkiRelease(db),manifest=seedTraining(db,releaseId);
  let clock=Date.UTC(2026,9,2,12),now=()=>clock;
  const actors=["administrator","superadministrator"].map((role,i)=>{
    const actor={role,login_id:i?"PLATFORM-SUPER":"PLATFORM-ADMIN",user_id:randomUUID(),credential_id:randomUUID()};
    db.prepare("INSERT INTO users(id) VALUES(?)").run(actor.user_id);
    db.prepare("INSERT INTO staff_credentials(id,user_id,login_id,role,scheme,salt,password_hash) VALUES(?,?,?,?,?,?,?)")
      .run(actor.credential_id,actor.user_id,actor.login_id,role,record.scheme,record.salt,record.password_hash);return actor;
  });
  const service=createAdminAccess(db,{now}),participantAccess=createParticipantAccess(db,{now});
  const state={db,manifest,releaseId,actors,service,participantAccess,advance:ms=>{clock+=ms;},now};
  if(!server){t.after(()=>db.close());return state;}
  const http=createDemoServer({access:participantAccess,adminAccess:service});
  await new Promise(resolve=>http.listen(0,"127.0.0.1",resolve));
  t.after(async()=>{http.closeAllConnections();await new Promise(resolve=>http.close(resolve));db.close();});
  const base="http://127.0.0.1:"+http.address().port;state.base=base;
  state.login=async(actor=actors[0],input={login_id:actor.login_id,password:PASSWORD},headers={})=>{
    const response=await fetch(base+"/api/admin/auth/login",{method:"POST",headers:{Origin:base,"Content-Type":"application/json",...headers},body:JSON.stringify(input)});
    const data=await response.json(),cookie=response.headers.get("set-cookie")?.split(";")[0];
    return {response,data,cookie,token:cookie?.split("=")[1]};
  };
  state.get=(url,cookie,headers={})=>fetch(base+url,{headers:{...(cookie?{Cookie:cookie}:{}),...headers}});
  return state;
}
test("role policy: both global readers/exporters; only superadmin is method manager; no processing/edit answers",()=>{
  for(const role of Object.keys(POLICY))for(const p of IMPLEMENTED)assert.equal(permits(role,p),true);
  assert.equal(permits("administrator","researchers.manage"),true);
  assert.equal(permits("superadministrator","methods.manage"),true);
  for(const role of ["administrator","participant","researcher",undefined,"toString"])assert.equal(permits(role,"methods.manage"),false);
  for(const role of Object.keys(POLICY))for(const p of ["responses.write","results.process"])assert.equal(permits(role,p),false);
});
test("local issuance: individual salted credentials and fixed server role, atomic duplicate rejection",async t=>{
  const {db,service}=await setup(t,{server:false});
  const id=await service.provision({role:"administrator",login_id:"LOCAL-MANAGER",password:PASSWORD});
  const row=db.prepare("SELECT * FROM staff_credentials WHERE id=?").get(id);
  assert.notEqual(row.salt,record.salt);assert.notEqual(row.password_hash,record.password_hash);assert.equal(row.version,1);
  assert.equal(JSON.stringify(row).includes(PASSWORD),false);
  assert.throws(()=>db.prepare("UPDATE staff_credentials SET role='superadministrator' WHERE id=?").run(id),/frozen/);
  assert.throws(()=>db.prepare("INSERT OR REPLACE INTO staff_credentials SELECT * FROM staff_credentials WHERE id=?").run(id),/already exists/);
  assert.throws(()=>db.prepare("DELETE FROM staff_credentials WHERE id=?").run(id),/revoke/);
  const before=db.prepare("SELECT count(*) AS n FROM users").get().n;
  await assert.rejects(service.provision({role:"superadministrator",login_id:"LOCAL-MANAGER",password:PASSWORD}));
  assert.equal(db.prepare("SELECT count(*) AS n FROM users").get().n,before);
  await assert.rejects(service.provision({role:"researcher",login_id:"BAD-ROLE",password:PASSWORD}),e=>e.status===400);
});
test("staff session role/user binding enforced by composite foreign key",async t=>{
  const {db,actors}=await setup(t,{server:false}),a=actors[0];
  assert.throws(()=>db.prepare(`INSERT INTO staff_sessions(token_hash,credential_id,user_id,role,credential_version,created_at_ms,last_seen_at_ms,expires_at_ms)
    VALUES(?,?,?,'superadministrator',1,1,1,1000)`).run(sha256("wrong-role"),a.credential_id,a.user_id),/FOREIGN KEY/);
});
test("anonymous and forged role headers/Bearer tokens cannot view or export",async t=>{
  const {get,manifest}=await setup(t),id=manifest.studies[0].attempts[0].id;
  for(const url of ["/api/admin/auth/session","/api/admin/studies","/api/admin/attempts","/api/admin/attempts/"+id,"/api/admin/answers.json","/api/admin/attempts/"+id+"/answers.json"]){
    const res=await get(url,COOKIE+"=guessed",{Authorization:"Bearer fake",'X-Role':"superadministrator"});
    assert.equal(res.status,401);assert.deepEqual(await res.json(),{error:"AUTH_REQUIRED"});assert.equal(res.headers.has("content-disposition"),false);
  }
});
test("both roles see and download every study without memberships, including closed/excluded records",async t=>{
  const {db,actors,login,get,manifest}=await setup(t);const other=manifest.studies[1];
  db.prepare("UPDATE studies SET status='closed' WHERE id=?").run(other.id);
  db.prepare("UPDATE participants SET status='excluded' WHERE study_id=?").run(other.id);
  db.prepare("UPDATE stage_enrollments SET status='excluded' WHERE study_id=?").run(other.id);
  db.prepare("UPDATE research_groups SET status='closed' WHERE study_id=?").run(other.id);
  db.prepare("UPDATE research_stages SET status='closed' WHERE study_id=?").run(other.id);
  db.prepare("UPDATE assignments SET status='closed' WHERE study_id=?").run(other.id);
  for(const actor of actors){
    const signed=await login(actor);assert.equal(signed.response.status,200);
    const session=await (await get("/api/admin/auth/session",signed.cookie)).json();assert.equal(session.role,actor.role);assert.equal(session.scope,"all_studies");
    assert.deepEqual(session.implemented_permissions,[...IMPLEMENTED]);assert.ok(session.planned_permissions.includes("researchers.manage"));
    assert.equal(session.planned_permissions.includes("methods.manage"),actor.role==="superadministrator");
    const studies=await (await get("/api/admin/studies",signed.cookie)).json();assert.equal(studies.studies.length,2);
    const list=await (await get("/api/admin/attempts",signed.cookie)).json();assert.equal(list.total,18);assert.equal(list.attempts.length,18);
    const detail=await (await get("/api/admin/attempts/"+other.attempts[0].id,signed.cookie)).json();assert.equal(detail.attempt.study_status,"closed");assert.equal(detail.attempt.answer_count,2);
    const exportRes=await get("/api/admin/answers.json",signed.cookie);assert.equal(exportRes.status,200);
    const exported=await exportRes.json();assert.equal(exported.protocol_count,18);assert.equal(new Set(exported.protocols.map(p=>p.study_id)).size,2);
    assert.equal(db.prepare("SELECT count(*) AS n FROM study_memberships WHERE user_id=?").get(actor.user_id).n,0);
  }
});
test("download snapshot is lossless, versioned, marks missing with null and excludes keys/results/credentials",async t=>{
  const {login,get,manifest}=await setup(t),signed=await login(),id=manifest.studies[0].attempts[0].id;
  const res=await get("/api/admin/attempts/"+id+"/answers.json",signed.cookie);
  assert.equal(res.status,200);assert.match(res.headers.get("content-disposition"),/^attachment; filename="pedpsy-attempt-answers.json"$/);
  assert.equal(res.headers.get("cache-control"),"no-store");assert.equal(res.headers.get("x-content-type-options"),"nosniff");
  const data=await res.json(),p=data.protocols[0];assert.equal(data.export_version,"pedpsy-primary-answers-1.0");assert.equal(data.scope,"single_attempt");
  assert.equal(p.items.length,30);assert.deepEqual(p.items.slice(0,3).map(i=>i.value),["A","B",null]);
  assert.equal(p.missing_item_ids.length,28);assert.equal(p.items[20].item_id,"q21");assert.ok(p.items.every(i=>i.options.length===2));
  assert.equal(p.method_version_id,"tki_ru_30_pairs@1.0.0");assert.equal(p.handler_version,"tki-contract-0.3.0");assert.equal(p.revision,1);
  for(const secret of ["key_digest","password_hash","salt","token_hash","source_text","measures","calculation",PASSWORD,signed.token])assert.equal(JSON.stringify(data).includes(secret),false);
});
test("participant credentials, cookie and renamed participant token never become staff",async t=>{
  const {participantAccess,manifest,get,login,actors}=await setup(t),study=manifest.studies[0],p=study.participants[0];
  await participantAccess.provision({study_id:study.id,participant_id:p.id,login_id:"S1-DEMO-001",password:PASSWORD});
  const signed=await participantAccess.login({login_id:"S1-DEMO-001",password:PASSWORD});
  for(const cookie of ["pedpsy_demo_session="+signed.token,COOKIE+"="+signed.token])assert.equal((await get("/api/admin/answers.json",cookie)).status,401);
  assert.equal((await login(actors[0],{login_id:"S1-DEMO-001",password:PASSWORD})).response.status,401);
  const staff=await login();assert.equal((await get("/api/participant/attempts","pedpsy_demo_session="+staff.token)).status,401);
  // A seeded research membership alone is not an administrative credential.
  assert.equal((await get("/api/admin/answers.json",COOKIE+"="+manifest.user_id)).status,401);
});
test("cookie is host-only HttpOnly Strict and only a hashed session token is persisted",async t=>{
  const {db,login}=await setup(t),signed=await login(),header=signed.response.headers.get("set-cookie");
  assert.match(header,/HttpOnly/);assert.match(header,/SameSite=Strict/);assert.match(header,/Max-Age=1800/);assert.doesNotMatch(header,/Domain=/);
  assert.equal(db.prepare("SELECT token_hash FROM staff_sessions").get().token_hash,sha256(signed.token));
  assert.equal(JSON.stringify(signed.data).includes(signed.token),false);
  assert.equal(cookieToken(signed.cookie+"; "+signed.cookie),null);assert.equal(cookieToken("x="+"a".repeat(5000)),null);
});
test("client cannot choose role/scope at login and repeated login rotates old staff session",async t=>{
  const {actors,login,get}=await setup(t),input={login_id:actors[0].login_id,password:PASSWORD};
  for(const extra of [{role:"superadministrator"},{study_id:randomUUID()},{scope:"all"}])assert.equal((await login(actors[0],{...input,...extra})).response.status,400);
  const first=await login(),second=await login(actors[0],input,{Cookie:first.cookie});assert.notEqual(first.token,second.token);
  assert.equal((await get("/api/admin/studies",first.cookie)).status,401);assert.equal((await get("/api/admin/studies",second.cookie)).status,200);
});
test("expiry, idle timeout and backward time fail closed on export",async t=>{
  for(const elapsed of [IDLE_TTL_MS,SESSION_TTL_MS,-1]){
    const {service,actors,advance}=await setup(t,{server:false});const signed=await service.login({login_id:actors[0].login_id,password:PASSWORD});advance(elapsed);
    assert.throws(()=>service.export(signed.token),e=>e.status===401);
  }
});
test("revoke, disabled user, credential version invalidation are checked on each request",async t=>{
  for(const mode of ["revoke","disabled","version"]){
    const {db,service,actors}=await setup(t,{server:false}),actor=actors[0],signed=await service.login({login_id:actor.login_id,password:PASSWORD});
    if(mode==="revoke")service.revoke(actor.login_id);
    if(mode==="disabled")db.prepare("UPDATE users SET status='disabled' WHERE id=?").run(actor.user_id);
    if(mode==="version")db.prepare("UPDATE staff_credentials SET version=version+1 WHERE id=?").run(actor.credential_id);
    assert.throws(()=>service.export(signed.token),e=>e.status===401);
  }
});
test("password reset revokes all sessions and accepts only the new password",async t=>{
  const {service,actors}=await setup(t,{server:false}),actor=actors[0],old=await service.login({login_id:actor.login_id,password:PASSWORD});
  const replacement=PASSWORD+"-new";await service.resetPassword(actor.login_id,replacement);
  assert.throws(()=>service.read(old.token,"anything"),e=>e.status===401);
  assert.equal(await service.login({login_id:actor.login_id,password:PASSWORD}),null);
  assert.ok(await service.login({login_id:actor.login_id,password:replacement}));
});
test("revocation during async password hash cannot mint a staff session",async t=>{
  const {service,actors,db}=await setup(t,{server:false}),a=actors[0];
  const pending=service.login({login_id:a.login_id,password:PASSWORD});service.revoke(a.login_id);
  assert.equal(await pending,null);assert.equal(db.prepare("SELECT count(*) AS n FROM staff_sessions").get().n,0);
});
test("unknown and wrong password share generic errors; persistent login throttle expires",async t=>{
  const {service,actors,db,advance,now}=await setup(t,{server:false}),a=actors[0];
  assert.equal(await service.login({login_id:"UNKNOWN-ACCOUNT",password:PASSWORD}),null);
  for(let i=0;i<LOGIN_LIMIT;i++)assert.equal(await service.login({login_id:a.login_id,password:PASSWORD+"-wrong"}),null);
  const reopened=createAdminAccess(db,{now});await assert.rejects(reopened.login({login_id:a.login_id,password:PASSWORD}),e=>e.status===429);
  advance(LOGIN_WINDOW_MS);assert.ok(await service.login({login_id:a.login_id,password:PASSWORD}));
});
test("login Origin, logout Origin/CSRF and cookie clearing are enforced",async t=>{
  const {login,get,base}=await setup(t);
  assert.equal((await login(undefined,undefined,{Origin:"http://evil.invalid"})).response.status,403);
  assert.equal((await login(undefined,undefined,{Origin:""})).response.status,403);
  const signed=await login();
  for(const headers of [{Origin:base},{Origin:"http://evil.invalid","X-CSRF-Token":signed.data.csrf_token}]){
    const res=await fetch(base+"/api/admin/auth/logout",{method:"POST",headers:{Cookie:signed.cookie,...headers}});assert.equal(res.status,403);
  }
  const out=await fetch(base+"/api/admin/auth/logout",{method:"POST",headers:{Cookie:signed.cookie,Origin:base,"X-CSRF-Token":signed.data.csrf_token}});
  assert.equal(out.status,200);assert.match(out.headers.get("set-cookie"),/Max-Age=0/);assert.equal((await get("/api/admin/answers.json",signed.cookie)).status,401);
});
test("paging validates numbers/duplicates and cannot use client role/study filters",async t=>{
  const {login,get}=await setup(t),signed=await login();
  const first=await (await get("/api/admin/attempts?offset=0&limit=10",signed.cookie)).json();
  const second=await (await get("/api/admin/attempts?offset=10&limit=10",signed.cookie)).json();assert.equal(first.attempts.length,10);assert.equal(second.attempts.length,8);
  assert.equal(new Set([...first.attempts,...second.attempts].map(a=>a.attempt_id)).size,18);
  for(const q of ["limit=101","limit=0","offset=-1","offset=foo","limit=1&limit=2","role=superadministrator","study_id=anything"])assert.equal((await get("/api/admin/attempts?"+q,signed.cookie)).status,400);
  assert.equal((await get("/api/admin/answers.json?token=anything",signed.cookie)).status,400);
});
test("missing IDs read/export get generic audited 404 and no attachment",async t=>{
  const {login,get,db}=await setup(t),signed=await login();
  for(const suffix of ["","/answers.json"]){const res=await get("/api/admin/attempts/"+randomUUID()+suffix,signed.cookie);assert.equal(res.status,404);assert.deepEqual(await res.json(),{error:"NOT_AVAILABLE"});assert.equal(res.headers.has("content-disposition"),false);}
  assert.equal(db.prepare("SELECT count(*) AS n FROM access_audit_events WHERE reason='NOT_AVAILABLE' AND outcome='deny'").get().n,2);
});
test("neither role gets response editing, processing, researcher CRUD or method editor endpoints",async t=>{
  const {login,actors,base,db,manifest}=await setup(t);const before=JSON.stringify(db.prepare("SELECT * FROM responses ORDER BY attempt_id,item_id").all());
  for(const actor of actors){const signed=await login(actor);
    for(const url of ["/api/admin/attempts/"+manifest.studies[0].attempts[0].id,"/api/admin/methods","/api/admin/researchers","/api/admin/process"]){
      const res=await fetch(base+url,{method:"POST",headers:{Cookie:signed.cookie,Origin:base,"X-CSRF-Token":signed.data.csrf_token,"Content-Type":"application/json"},body:'{"value":"B"}'});
      assert.ok([404,405].includes(res.status));
    }
  }
  assert.equal(JSON.stringify(db.prepare("SELECT * FROM responses ORDER BY attempt_id,item_id").all()),before);
  assert.equal(db.prepare("SELECT count(*) AS n FROM attempt_results").get().n,0);
});
test("export refuses over-budget batches rather than truncating silently",async t=>{
  const {db,service,actors,manifest,releaseId}=await setup(t,{server:false}),signed=await service.login({login_id:actors[0].login_id,password:PASSWORD});
  const s=manifest.studies[0],a=s.attempts[0];
  for(let i=0;i<EXPORT_LIMIT;i++){
    const p=randomUUID(),e=randomUUID();
    db.prepare("INSERT INTO participants(id,study_id,display_code) VALUES(?,?,?)").run(p,s.id,"BUDGET-"+i);
    db.prepare("INSERT INTO stage_enrollments(id,study_id,participant_id,group_id,stage_id) VALUES(?,?,?,?,?)").run(e,s.id,p,a.group_id,a.stage_id);
    db.prepare("INSERT INTO attempts(id,study_id,enrollment_id,assignment_id,group_id,stage_id,release_id,current_item_id) VALUES(?,?,?,?,?,?,?,'q01')")
      .run(randomUUID(),s.id,e,a.assignment_id,a.group_id,a.stage_id,releaseId);
  }
  assert.throws(()=>service.export(signed.token),e=>e.status===413 && e.code==="EXPORT_LIMIT");
  assert.equal(JSON.parse(service.export(signed.token,a.id)).protocol_count,1);
  assert.equal(db.prepare("SELECT count(*) AS n FROM access_audit_events WHERE reason='EXPORT_LIMIT' AND outcome='deny'").get().n,1);
});
test("audit records actor role/action/resource/count only, stays append-only; audit failure blocks download",async t=>{
  const {db,login,get,manifest}=await setup(t),signed=await login(),id=manifest.studies[0].attempts[0].id;
  await get("/api/admin/attempts/"+id+"/answers.json",signed.cookie);
  const event=db.prepare("SELECT * FROM access_audit_events WHERE action='staff_answers_export'").get();
  assert.equal(event.actor_role,"administrator");assert.equal(event.resource_id,id);assert.equal(event.record_count,1);
  const serialized=JSON.stringify(db.prepare("SELECT * FROM access_audit_events").all());
  for(const secret of [PASSWORD,signed.token,"q01","password_hash","options"])assert.equal(serialized.includes(secret),false);
  assert.throws(()=>db.prepare("UPDATE access_audit_events SET reason='changed'").run(),/append only/);
  db.exec("CREATE TRIGGER simulate_audit_failure BEFORE INSERT ON access_audit_events BEGIN SELECT RAISE(ABORT,'unavailable audit'); END;");
  const denied=await get("/api/admin/answers.json",signed.cookie);assert.equal(denied.status,500);assert.equal(denied.headers.has("content-disposition"),false);
  assert.deepEqual(await denied.json(),{error:"DEMO_SERVER_ERROR"});
});
test("static staff page exists; absent service fails closed; CLI refuses secrets without interactive TTY",async t=>{
  const {get}=await setup(t);for(const url of ["/admin","/admin.js"])assert.equal((await get(url)).status,200);
  const http=createDemoServer();await new Promise(resolve=>http.listen(0,"127.0.0.1",resolve));
  t.after(async()=>{http.closeAllConnections();await new Promise(resolve=>http.close(resolve));});
  assert.equal((await fetch("http://127.0.0.1:"+http.address().port+"/api/admin/answers.json")).status,503);
  const command=spawnSync(process.execPath,[path.join(__dirname,"../storage/staff-cli.js"),"issue","administrator","LOCAL-ADMIN"],{encoding:"utf8"});
  assert.equal(command.status,1);assert.equal(command.stdout,"");assert.match(command.stderr,/interactive terminal/);
});
