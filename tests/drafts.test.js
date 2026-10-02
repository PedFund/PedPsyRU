"use strict";
const {test,before}=require("node:test"),assert=require("node:assert/strict");
const {randomUUID,randomBytes}=require("node:crypto");
const {mkdtempSync,rmSync}=require("node:fs");
const path=require("node:path"),{tmpdir}=require("node:os");
const {openDatabase,migrate,sha256,transaction}=require("../storage/database.js");
const {importTkiRelease}=require("../storage/releases.js");
const {seedTraining}=require("../storage/seed.js");
const {createParticipantAccess,passwordRecord,csrfFor,SESSION_TTL_MS,IDLE_TTL_MS}=require("../storage/access.js");
const {createDraftStore}=require("../storage/drafts.js");
const {createAdminAccess}=require("../storage/admin-access.js");
const {createDemoServer}=require("../web/server.js");
const {scoreTki}=require("../core/tki-contract.js");
const form=require("../methods/tki/form.json");
const PASSWORD="synthetic-draft-test-password-27";let record;
before(async()=>{record=await passwordRecord(PASSWORD);});
async function setup(t,{filename=":memory:",server=false}={}) {
  const db=openDatabase(filename);migrate(db);const release=importTkiRelease(db),manifest=seedTraining(db,release);
  let clock=Date.UTC(2026,9,2,20),now=()=>clock;
  const actors=[manifest.studies[0],manifest.studies[1]].map((study,i)=>{
    const credential=randomUUID(),token=randomBytes(32).toString("base64url"),participant=study.participants[0],id=study.attempts[0].id;
    db.prepare("INSERT INTO participant_credentials(id,study_id,participant_id,login_id,scheme,salt,password_hash) VALUES(?,?,?,?,?,?,?)")
      .run(credential,study.id,participant.id,"DRAFT-TEST-"+i,record.scheme,record.salt,record.password_hash);
    db.prepare(`INSERT INTO participant_sessions(token_hash,credential_id,study_id,participant_id,credential_version,created_at_ms,last_seen_at_ms,expires_at_ms)
      VALUES(?,?,?,?,1,?,?,?)`).run(sha256(token),credential,study.id,participant.id,clock,clock,clock+SESSION_TTL_MS);
    return {credential,token,csrf:csrfFor(token),study,participant,id,login_id:"DRAFT-TEST-"+i};
  });
  const access=createParticipantAccess(db,{now}),drafts=createDraftStore(db,access,{now});
  const state={db,release,manifest,actors,access,drafts,now,advance:ms=>{clock+=ms;}};
  if(!server){t.after(()=>{if(db.isOpen)db.close();});return state;}
  const http=createDemoServer({access,drafts,adminAccess:createAdminAccess(db,{now})});
  await new Promise(resolve=>http.listen(0,"127.0.0.1",resolve));
  t.after(async()=>{http.closeAllConnections();await new Promise(resolve=>http.close(resolve));if(db.isOpen)db.close();});
  const base="http://127.0.0.1:"+http.address().port;state.base=base;
  state.get=(id=actors[0].id,actor=actors[0])=>fetch(base+"/api/participant/attempts/"+id+"/draft",{headers:{Cookie:"pedpsy_demo_session="+actor.token}});
  state.put=(input,id=actors[0].id,actor=actors[0],headers={})=>fetch(base+"/api/participant/attempts/"+id+"/draft",{
    method:"PUT",headers:{Origin:base,Cookie:"pedpsy_demo_session="+actor.token,"Content-Type":"application/json","X-CSRF-Token":actor.csrf,...headers},body:JSON.stringify(input)});
  return state;
}
const input=(revision=1)=>({expected_revision:revision,current_item_id:"q08",responses:[{item_id:"q01",value:"B"},{item_id:"q07",value:"A"}]});
const domain=db=>JSON.stringify(db.prepare("SELECT * FROM attempts ORDER BY id").all())+JSON.stringify(db.prepare("SELECT * FROM responses ORDER BY attempt_id,item_id").all());
test("own GET draft returns pinned form, responses, slide and versions, never keys/source/credentials/results",async t=>{
  const {get}=await setup(t,{server:true});const r=await get();assert.equal(r.status,200);assert.equal(r.headers.get("cache-control"),"no-store");
  const {attempt:s}=await r.json();assert.equal(s.persistence,true);assert.equal(s.current_item_id,"q03");assert.equal(s.revision,1);assert.equal(s.form.items.length,30);
  assert.deepEqual(s.responses,[{item_id:"q01",value:"A"},{item_id:"q02",value:"B"}]);
  for(const denied of ["source_text","key_digest","password_hash","token_hash","measures"])assert.equal(JSON.stringify(s).includes(denied),false);
});
test("partial/complete PUT atomically replaces answers, slide and revision without scoring or new attempts",async t=>{
  const {db,get,put,actors}=await setup(t,{server:true});let r=await put(input());assert.equal(r.status,200);
  let s=(await r.json()).attempt;assert.equal(s.revision,2);assert.equal(s.current_item_id,"q08");assert.deepEqual(s.responses,input().responses);
  assert.equal(s.responses.some(r=>r.item_id==="q02"),false);
  r=await put({expected_revision:2,current_item_id:"q30",responses:form.items.map(i=>({item_id:i.id,value:"A"}))});assert.equal(r.status,200);
  s=(await (await get()).json()).attempt;assert.equal(s.status,"draft");assert.equal(s.responses.length,30);assert.equal(s.revision,3);
  assert.equal(db.prepare("SELECT count(*) AS n FROM attempt_results").get().n,0);assert.equal(db.prepare("SELECT count(*) AS n FROM attempts").get().n,18);
  assert.equal(db.prepare("SELECT revision FROM attempts WHERE id=?").get(actors[1].id).revision,1);
});
test("same revision in two simultaneous HTTP saves admits one, returns 409 to the other, retains winner",async t=>{
  const {put,get}=await setup(t,{server:true}),a=input(),b={...input(),current_item_id:"q10",responses:[{item_id:"q10",value:"B"}]};
  const results=await Promise.all([put(a),put(b)]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
  const winner=results[0].status===200?a:b,loser=results.find(r=>r.status===409);assert.deepEqual(await loser.json(),{error:"REVISION_CONFLICT"});
  const s=(await (await get()).json()).attempt;assert.equal(s.revision,2);assert.equal(s.current_item_id,winner.current_item_id);assert.deepEqual(s.responses,winner.responses);
});
test("invalid snapshots, duplicates, unknown IDs, Cyrillic values, fake versions/scope are denied without changing domain",async t=>{
  const {db,drafts,actors}=await setup(t),a=actors[0],baseline=domain(db);
  const cases=[null,[],{}, {...input(),expected_revision:-1},{...input(),expected_revision:1.5},{...input(),expected_revision:Number.MAX_SAFE_INTEGER},
    {...input(),current_item_id:"q31"},{...input(),responses:[{item_id:"q01",value:"А"}]},{...input(),responses:[{item_id:"q01",value:"a"}]},
    {...input(),responses:[{item_id:"q01",value:"A"},{item_id:"q01",value:"B"}]},{...input(),responses:[{item_id:"q31",value:"A"}]},
    {...input(),responses:[{item_id:"q01",value:"A",text:"fake"}]},{...input(),responses:null},{...input(),release_id:randomUUID()},
    {...input(),study_id:a.study.id},{...input(),role:"administrator"},{...input(),method_version_id:"other"},{...input(),responses:Array(31).fill({item_id:"q01",value:"A"})}];
  for(const candidate of cases){assert.throws(()=>drafts.save(a.token,a.id,candidate,a.csrf),e=>e.status===400 && e.code==="INVALID_DRAFT");assert.equal(domain(db),baseline);}
});
test("anonymous, same-study foreign, cross-study and missing IDs cannot read/write a draft",async t=>{
  const {base,get,put,actors,manifest,db}=await setup(t,{server:true}),before=domain(db);
  assert.equal((await fetch(base+"/api/participant/attempts/"+actors[0].id+"/draft")).status,401);
  const same=manifest.studies[0].attempts.find(a=>a.participant_id!==actors[0].participant.id).id;
  for(const id of [same,actors[1].id,randomUUID()])for(const r of [await get(id),await put(input(),id)]){
    assert.equal(r.status,404);assert.deepEqual(await r.json(),{error:"NOT_AVAILABLE"});
  }
  assert.equal(domain(db),before);
});
test("both administrative realms cannot impersonate participant writes, even with renamed valid staff token",async t=>{
  const {db,base,put}=await setup(t,{server:true}),service=createAdminAccess(db);
  for(const role of ["administrator","superadministrator"]){
    await service.provision({role,login_id:role.toUpperCase(),password:PASSWORD});const staff=await service.login({login_id:role.toUpperCase(),password:PASSWORD});
    const r=await put(input(),undefined,undefined,{Cookie:"pedpsy_demo_session="+staff.token,"X-CSRF-Token":staff.csrf_token});assert.equal(r.status,401);
    const r2=await fetch(base+"/api/participant/attempts/anything/draft",{headers:{Cookie:"pedpsy_staff_session="+staff.token}});assert.equal(r2.status,401);
  }
});
test("PUT requires same-origin/CSRF/JSON/body budget and rejects unsupported methods",async t=>{
  const {put,base,actors,db}=await setup(t,{server:true}),baseline=domain(db),url=base+"/api/participant/attempts/"+actors[0].id+"/draft";
  for(const [headers,status] of [[{Origin:""},403],[{Origin:"http://evil.invalid"},403],[{"X-CSRF-Token":"wrong"},403],[{"X-CSRF-Token":""},403],[{"Content-Type":"text/plain"},415]])assert.equal((await put(input(),undefined,undefined,headers)).status,status);
  const headers={Origin:base,Cookie:"pedpsy_demo_session="+actors[0].token,"X-CSRF-Token":actors[0].csrf,"Content-Type":"application/json"};
  for(const [body,status] of [["{bad",400],["x".repeat(8193),413]])assert.equal((await fetch(url,{method:"PUT",headers,body})).status,status);
  for(const method of ["POST","PATCH","DELETE"])assert.equal((await fetch(url,{method,headers})).status,405);
  assert.equal(domain(db),baseline);
});
test("revoked/expired credentials and closed/excluded assignments are rechecked before every write",async t=>{
  const {db,actors,drafts,access,advance}=await setup(t),a=actors[0],baseline=domain(db),attempt=a.study.attempts[0];
  for(const [table,id,status] of [["stage_enrollments",attempt.enrollment_id,"excluded"],["assignments",attempt.assignment_id,"closed"],
    ["research_groups",attempt.group_id,"closed"],["research_stages",attempt.stage_id,"closed"]]){
    db.prepare(`UPDATE ${table} SET status=? WHERE id=?`).run(status,id);assert.throws(()=>drafts.save(a.token,a.id,input(),a.csrf),e=>e.status===404);
    db.prepare(`UPDATE ${table} SET status='active' WHERE id=?`).run(id);
  }
  db.prepare("UPDATE participants SET status='excluded' WHERE id=?").run(a.participant.id);assert.throws(()=>drafts.save(a.token,a.id,input(),a.csrf),e=>e.status===401);
  db.prepare("UPDATE participants SET status='active' WHERE id=?").run(a.participant.id);
  access.revoke(a.login_id);assert.throws(()=>drafts.save(a.token,a.id,input(),a.csrf),e=>e.status===401);
  advance(IDLE_TTL_MS);assert.throws(()=>drafts.save(actors[1].token,actors[1].id,input(),actors[1].csrf),e=>e.status===401);assert.equal(domain(db),baseline);
});
test("empty snapshot clears only own draft and returns q01/revision; T1/T2 answers never inherit T0",async t=>{
  const {db,actors,drafts}=await setup(t),a=actors[0];const cleared=drafts.save(a.token,a.id,{expected_revision:1,current_item_id:"q01",responses:[]},a.csrf);
  assert.equal(cleared.responses.length,0);assert.equal(cleared.current_item_id,"q01");assert.equal(cleared.revision,2);
  assert.equal(db.prepare("SELECT count(*) AS n FROM responses WHERE study_id=?").get(actors[1].study.id).n,2);
  for(const x of a.study.attempts.filter(x=>x.participant_id===a.participant.id && x.id!==a.id))assert.equal(drafts.read(a.token,x.id).responses.length,0);
});
test("storage failure after snapshot deletion/insertion rolls back answers, position and revision",async t=>{
  const {db,actors,drafts}=await setup(t),a=actors[0],before=domain(db);
  db.exec("CREATE TRIGGER simulated_write_failure BEFORE UPDATE OF revision ON attempts BEGIN SELECT RAISE(ABORT,'write unavailable'); END;");
  assert.throws(()=>drafts.save(a.token,a.id,input(),a.csrf),/write unavailable/);assert.equal(domain(db),before);
});
test("mandatory audit failure also rolls back snapshot and revision",async t=>{
  const {db,actors,drafts}=await setup(t),a=actors[0],before=domain(db);
  db.exec("CREATE TRIGGER simulated_audit_failure BEFORE INSERT ON access_audit_events WHEN NEW.action='draft_save' BEGIN SELECT RAISE(ABORT,'audit unavailable'); END;");
  assert.throws(()=>drafts.save(a.token,a.id,input(),a.csrf),/audit unavailable/);assert.equal(domain(db),before);
});
test("save/read/conflict audit contains metadata only, not answers, text, password or token",async t=>{
  const {db,actors,drafts}=await setup(t),a=actors[0];drafts.save(a.token,a.id,input(),a.csrf);drafts.read(a.token,a.id);
  assert.throws(()=>drafts.save(a.token,a.id,input(),a.csrf),e=>e.status===409);
  const rows=db.prepare("SELECT * FROM access_audit_events WHERE action LIKE 'draft_%'").all();assert.ok(rows.some(r=>r.reason==="REVISION_CONFLICT" && r.outcome==="deny"));
  assert.ok(rows.some(r=>r.action==="draft_save" && r.record_count===2 && r.resource_id===a.id));
  for(const denied of ["q01","q07",PASSWORD,a.token,a.csrf,"responses","настойчив"])assert.equal(JSON.stringify(rows).includes(denied),false);
});
test("server/SQLite restart and new login restore same attempt; separate connection stale save gets conflict",async t=>{
  const directory=mkdtempSync(path.join(tmpdir(),"pedpsy-draft-test-")),filename=path.join(directory,"training.sqlite");
  let primary,secondary,reopened;
  t.after(()=>{for(const connection of [primary,secondary,reopened])if(connection?.isOpen)connection.close();
    assert.equal(path.dirname(directory),path.resolve(tmpdir()));assert.ok(path.basename(directory).startsWith("pedpsy-draft-test-"));rmSync(directory,{recursive:true,force:true});});
  const {db,actors,drafts,now}=await setup(t,{filename}),a=actors[0];primary=db;const otherDb=openDatabase(filename);secondary=otherDb;
  const other=createDraftStore(otherDb,createParticipantAccess(otherDb,{now}),{now});assert.equal(other.read(a.token,a.id).revision,1);
  const saved=drafts.save(a.token,a.id,input(),a.csrf);assert.throws(()=>other.save(a.token,a.id,input(),a.csrf),e=>e.code==="REVISION_CONFLICT");otherDb.close();db.close();
  reopened=openDatabase(filename);assert.equal(migrate(reopened),0);
  const access=createParticipantAccess(reopened,{now}),restored=createDraftStore(reopened,access,{now});
  const signed=await access.login({login_id:a.login_id,password:PASSWORD});assert.ok(signed);assert.deepEqual(restored.read(signed.token,a.id),saved);
  assert.equal(reopened.prepare("SELECT count(*) AS n FROM attempts").get().n,18);
});
test("completed protocol can be read but never edited or cleared; result and full responses remain immutable",async t=>{
  const {db,actors,drafts}=await setup(t),a=actors[0],full=form.items.map(i=>({item_id:i.id,value:"A"}));
  const saved=drafts.save(a.token,a.id,{expected_revision:1,current_item_id:"q30",responses:full},a.csrf);
  // Test-only fixture finalization; no application completion endpoint is added in 01д.4.
  const result=scoreTki({...saved.versions,responses:full}),resultId=randomUUID();assert.equal(result.status,"scored");
  transaction(db,()=>{
    db.prepare(`INSERT INTO attempt_results(id,study_id,attempt_id,release_id,input_revision,responses_digest,contract_version,handler_version,key_digest,payload)
      VALUES(?,?,?,?,?,?,?,?,?,?)`).run(resultId,a.study.id,a.id,saved.release_id,saved.revision,sha256(JSON.stringify(full)),result.contract_version,result.handler_version,result.calculation.key_digest,JSON.stringify(result));
    db.prepare("UPDATE attempts SET status='completed',revision=revision+1,completion_result_id=?,completed_at='2026-10-02T20:00:00Z' WHERE id=?").run(resultId,a.id);
  });
  const before=domain(db),read=drafts.read(a.token,a.id);assert.equal(read.status,"completed");assert.equal(read.responses.length,30);
  for(const candidate of [input(3),{expected_revision:3,current_item_id:"q01",responses:[]}])assert.throws(()=>drafts.save(a.token,a.id,candidate,a.csrf),e=>e.code==="ATTEMPT_COMPLETED");
  assert.equal(domain(db),before);assert.equal(db.prepare("SELECT count(*) AS n FROM attempt_results").get().n,1);
});
test("lost acknowledgement recovery is GET; stale retry cannot overwrite, and no result endpoint is opened",async t=>{
  const {put,get,base,actors}=await setup(t,{server:true});await put(input()); // Intentionally discard the response body.
  const retry=await put(input());assert.equal(retry.status,409);const state=(await (await get()).json()).attempt;assert.equal(state.revision,2);assert.equal(state.current_item_id,"q08");
  for(const suffix of ["/complete","/result"])assert.equal((await fetch(base+"/api/participant/attempts/"+actors[0].id+suffix,{headers:{Cookie:"pedpsy_demo_session="+actors[0].token}})).status,404);
});
