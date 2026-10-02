"use strict";
const {test,before}=require("node:test"),assert=require("node:assert/strict");
const {randomUUID,randomBytes}=require("node:crypto");
const {mkdtempSync,rmSync}=require("node:fs"),path=require("node:path"),{tmpdir}=require("node:os");
const {openDatabase,migrate,sha256}=require("../storage/database.js");
const {importTkiRelease,responsesDigest}=require("../storage/releases.js");
const {seedTraining}=require("../storage/seed.js");
const {createParticipantAccess,passwordRecord,csrfFor,SESSION_TTL_MS}=require("../storage/access.js");
const {createDraftStore}=require("../storage/drafts.js"),{createCompletionStore}=require("../storage/completion.js");
const {createDemoServer}=require("../web/server.js"),{scoreTki}=require("../core/tki-contract.js");
const form=require("../methods/tki/form.json"),reference=require("./fixtures/tki-reference.json");
const PASSWORD="synthetic-completion-test-password-27";let record;
before(async()=>{record=await passwordRecord(PASSWORD);});
const full=()=>form.items.map(i=>({item_id:i.id,value:"A"}));
const domain=db=>JSON.stringify(["attempts","responses","attempt_results"].map(x=>db.prepare("SELECT * FROM "+x+" ORDER BY rowid").all()));
async function setup(t,{filename=":memory:",score=scoreTki}={}) {
  const db=openDatabase(filename);migrate(db);const release=importTkiRelease(db),manifest=seedTraining(db,release),now=()=>Date.UTC(2026,9,3);
  const actors=manifest.studies.map((study,i)=>{
    const credential=randomUUID(),token=randomBytes(32).toString("base64url"),participant=study.participants[0],id=study.attempts[0].id;
    db.prepare("INSERT INTO participant_credentials(id,study_id,participant_id,login_id,scheme,salt,password_hash) VALUES(?,?,?,?,?,?,?)")
      .run(credential,study.id,participant.id,"COMPLETION-TEST-"+i,record.scheme,record.salt,record.password_hash);
    db.prepare(`INSERT INTO participant_sessions(token_hash,credential_id,study_id,participant_id,credential_version,created_at_ms,last_seen_at_ms,expires_at_ms)
      VALUES(?,?,?,?,1,?,?,?)`).run(sha256(token),credential,study.id,participant.id,now(),now(),now()+SESSION_TTL_MS);
    return {credential,token,csrf:csrfFor(token),study,participant,id,login_id:"COMPLETION-TEST-"+i};
  });
  const access=createParticipantAccess(db,{now}),drafts=createDraftStore(db,access,{now}),completion=createCompletionStore(db,access,{now,score});
  const http=createDemoServer({access,drafts,completion});await new Promise(r=>http.listen(0,"127.0.0.1",r));
  t.after(async()=>{http.closeAllConnections();await new Promise(r=>http.close(r));if(db.isOpen)db.close();});
  const base="http://127.0.0.1:"+http.address().port;
  const get=(id=actors[0].id,actor=actors[0])=>fetch(base+"/api/participant/attempts/"+id+"/result",{headers:{Cookie:"pedpsy_demo_session="+actor.token}});
  const finish=(input={expected_revision:2},id=actors[0].id,actor=actors[0],headers={})=>fetch(base+"/api/participant/attempts/"+id+"/complete",{
    method:"POST",headers:{Origin:base,Cookie:"pedpsy_demo_session="+actor.token,"Content-Type":"application/json","X-CSRF-Token":actor.csrf,...headers},body:JSON.stringify(input)});
  const save=(responses=full(),revision=1)=>drafts.save(actors[0].token,actors[0].id,{expected_revision:revision,current_item_id:"q30",responses},actors[0].csrf);
  return {db,release,actors,access,drafts,completion,base,get,finish,save,now};
}
test("saved full snapshot completes once with pinned versions, canonical digest and reference scores",async t=>{
  let calls=0;const s=await setup(t,{score:r=>{calls++;return scoreTki(r);}});s.save(full().reverse());
  const r=await s.finish();assert.equal(r.status,200);const value=(await r.json()).completion;
  assert.equal(value.status,"completed");assert.equal(value.input_revision,2);assert.equal(value.revision,3);assert.equal(value.persistence,true);
  const expected=Object.fromEntries(reference.scale_order.map(code=>[code,reference.reference_pair_scales.filter(pair=>pair[0]===code).length]));
  assert.deepEqual(Object.fromEntries(value.result.measures.map(m=>[m.code,m.value])),expected);
  assert.equal(value.responses_digest,responsesDigest(form.items,full()));assert.equal(value.result.method_version_id,"tki_ru_30_pairs@1.0.0");
  assert.equal(value.result.classifications.length,0);assert.equal(value.result.validation_state,"key_verified");
  const before=domain(s.db);for(const rev of [2,3,0]){const retry=await s.finish({expected_revision:rev});assert.equal(retry.status,200);assert.deepEqual((await retry.json()).completion,value);}
  assert.equal(calls,1);assert.equal(domain(s.db),before);assert.deepEqual((await (await s.get()).json()).completion,value);
  assert.equal(s.db.prepare("SELECT count(*) n FROM attempt_results").get().n,1);assert.equal(s.db.prepare("PRAGMA foreign_key_check").all().length,0);
  for(const text of [PASSWORD,s.actors[0].token,"password_hash","token_hash","source_text","responses\""])assert.equal(JSON.stringify(value).includes(text),false);
});
test("incomplete result is unavailable and partial snapshot never completes or creates a result",async t=>{
  const s=await setup(t),before=domain(s.db);assert.equal((await s.get()).status,409);
  assert.equal((await s.finish({expected_revision:1})).status,422);assert.equal(domain(s.db),before);
  assert.equal(s.db.prepare("SELECT count(*) n FROM attempt_results").get().n,0);
});
test("invalid completion bodies and stale draft revision cannot supply answers, scores, versions, role or scope",async t=>{
  const s=await setup(t);s.save();const before=domain(s.db);
  for(const input of [null,[],{},1,{expected_revision:-1},{expected_revision:1.2},{expected_revision:Number.MAX_SAFE_INTEGER},
    {expected_revision:"2"},{expected_revision:2,responses:full()},{expected_revision:2,result:{}},{expected_revision:2,role:"superadministrator"},
    {expected_revision:2,study_id:s.actors[1].study.id},{expected_revision:2,method_version_id:"legacy"}])assert.equal((await s.finish(input)).status,400);
  const conflict=await s.finish({expected_revision:1});assert.equal(conflict.status,409);assert.equal((await conflict.json()).error,"REVISION_CONFLICT");assert.equal(domain(s.db),before);
});
test("simultaneous completions return the same stored result; lost acknowledgement can be reread/retried",async t=>{
  const s=await setup(t);s.save();const replies=await Promise.all([s.finish(),s.finish()]);assert.deepEqual(replies.map(r=>r.status),[200,200]);
  const bodies=await Promise.all(replies.map(r=>r.json()));assert.deepEqual(bodies[0],bodies[1]);
  assert.deepEqual(await (await s.get()).json(),bodies[0]);assert.equal(s.db.prepare("SELECT count(*) n FROM attempt_results").get().n,1);
});
test("completed answers, position and result cannot be changed or cleared",async t=>{
  const s=await setup(t);s.save();await s.finish();const before=domain(s.db);
  assert.throws(()=>s.save([],3),e=>e.code==="ATTEMPT_COMPLETED");assert.equal(domain(s.db),before);
  const state=s.drafts.read(s.actors[0].token,s.actors[0].id);assert.equal(state.status,"completed");assert.equal(state.responses.length,30);
});
test("save versus complete never returns a result calculated from overwritten revision",async t=>{
  const s=await setup(t);s.save();const id=s.actors[0].id,a=s.actors[0];
  const write=fetch(s.base+"/api/participant/attempts/"+id+"/draft",{method:"PUT",headers:{Origin:s.base,Cookie:"pedpsy_demo_session="+a.token,
    "Content-Type":"application/json","X-CSRF-Token":a.csrf},body:JSON.stringify({expected_revision:2,current_item_id:"q01",responses:[]})});
  const replies=await Promise.all([write,s.finish()]);assert.ok([[200,409],[409,200]].some(pair=>pair.every((v,i)=>replies[i].status===v)));
  const attempt=s.db.prepare("SELECT * FROM attempts WHERE id=?").get(id),count=s.db.prepare("SELECT count(*) n FROM attempt_results").get().n;
  assert.equal(count,attempt.status==="completed"?1:0);assert.equal(s.db.prepare("PRAGMA foreign_key_check").all().length,0);
});
test("foreign/same-study/missing IDs and anonymous requests cannot read or complete",async t=>{
  const s=await setup(t);s.save();await s.finish();const before=domain(s.db),a=s.actors[0];
  const sameStudy=a.study.attempts.find(x=>x.participant_id!==a.participant.id).id;
  for(const id of [sameStudy,s.actors[1].id,randomUUID()]){assert.equal((await s.get(id)).status,404);assert.equal((await s.finish({},id)).status,404);}
  for(const suffix of ["/result","/complete"]){const r=await fetch(s.base+"/api/participant/attempts/"+a.id+suffix,{method:suffix==="/complete"?"POST":"GET"});assert.equal(r.status,401);}
  assert.equal(domain(s.db),before);
});
test("staff-shaped tokens cannot elevate participant result/write access",async t=>{
  const s=await setup(t);s.save();const before=domain(s.db);
  for(const role of ["administrator","superadministrator"]){const user=randomUUID(),credential=randomUUID(),token=randomBytes(32).toString("base64url");
    s.db.prepare("INSERT INTO users(id) VALUES(?)").run(user);
    s.db.prepare("INSERT INTO staff_credentials(id,user_id,login_id,role,scheme,salt,password_hash) VALUES(?,?,?,?,?,?,?)")
      .run(credential,user,"RESULT-STAFF-"+role,role,record.scheme,record.salt,record.password_hash);
    s.db.prepare(`INSERT INTO staff_sessions(token_hash,credential_id,user_id,role,credential_version,created_at_ms,last_seen_at_ms,expires_at_ms)
      VALUES(?,?,?,?,1,?,?,?)`).run(sha256(token),credential,user,role,s.now(),s.now(),s.now()+SESSION_TTL_MS);
    for(const cookie of ["pedpsy_staff_session="+token,"pedpsy_demo_session="+token]){
      assert.equal((await s.finish(undefined,undefined,undefined,{Cookie:cookie})).status,401);
      assert.equal((await fetch(s.base+"/api/participant/attempts/"+s.actors[0].id+"/result",{headers:{Cookie:cookie}})).status,401);
    }
  }assert.equal(domain(s.db),before);
});
test("Origin, CSRF, JSON/body/query/method bounds fail without domain mutation",async t=>{
  const s=await setup(t);s.save();const before=domain(s.db),a=s.actors[0];
  for(const headers of [{Origin:""},{Origin:"https://foreign.example"},{"X-CSRF-Token":"wrong"}])assert.equal((await s.finish(undefined,undefined,undefined,headers)).status,403);
  assert.equal((await s.finish(undefined,undefined,undefined,{"Content-Type":"text/plain"})).status,415);
  assert.equal((await s.finish({expected_revision:2,padding:"x".repeat(2100)})).status,413);
  const root=s.base+"/api/participant/attempts/"+a.id;
  for(const [suffix,method,status]of [["/complete","GET",405],["/result","PUT",405],["/complete?role=administrator","POST",400]]){
    assert.equal((await fetch(root+suffix,{method,headers:{Cookie:"pedpsy_demo_session="+a.token}})).status,status);
  }assert.equal(domain(s.db),before);
});
test("revoked, excluded and closed assignment deny result read and completion per request",async t=>{
  for(const mutation of [s=>s.access.revoke(s.actors[0].login_id),s=>s.db.prepare("UPDATE participants SET status='excluded' WHERE id=?").run(s.actors[0].participant.id),
    s=>s.db.prepare("UPDATE assignments SET status='closed' WHERE id=(SELECT assignment_id FROM attempts WHERE id=?)").run(s.actors[0].id)]){
    const s=await setup(t);s.save();await s.finish();const before=domain(s.db);mutation(s);
    assert.ok([401,404].includes((await s.get()).status));assert.ok([401,404].includes((await s.finish()).status));assert.equal(domain(s.db),before);
  }
});
test("storage and mandatory completion audit failures roll back result and completed atomically",async t=>{
  for(const trigger of ["CREATE TRIGGER fail_result BEFORE UPDATE OF status ON attempts BEGIN SELECT RAISE(ABORT,'storage unavailable'); END;",
    "CREATE TRIGGER fail_audit BEFORE INSERT ON access_audit_events WHEN NEW.action='attempt_complete' BEGIN SELECT RAISE(ABORT,'audit unavailable'); END;"]){
    const s=await setup(t);s.save();const before=domain(s.db);s.db.exec(trigger);assert.equal((await s.finish()).status,500);assert.equal(domain(s.db),before);
    s.db.exec(trigger.includes("fail_result")?"DROP TRIGGER fail_result":"DROP TRIGGER fail_audit");assert.equal((await s.finish()).status,200);
  }
});
test("result audit failure prevents returning stored scores; metadata audit contains no answers or scores",async t=>{
  const s=await setup(t);s.save();await s.finish();await s.get();await s.finish();
  const rows=s.db.prepare("SELECT * FROM access_audit_events WHERE action IN ('result_read','attempt_complete')").all();
  assert.ok(rows.some(r=>r.reason==="ALREADY_COMPLETED"));for(const denied of [PASSWORD,s.actors[0].token,"q01","measures","responses_digest"])assert.equal(JSON.stringify(rows).includes(denied),false);
  s.db.exec("CREATE TRIGGER fail_result_read BEFORE INSERT ON access_audit_events WHEN NEW.action='result_read' BEGIN SELECT RAISE(ABORT,'audit unavailable'); END;");
  const r=await s.get();assert.equal(r.status,500);assert.deepEqual(await r.json(),{error:"DEMO_SERVER_ERROR"});
});
test("scoring rejection/error never leaves completed or a result",async t=>{
  for(const score of [()=>({status:"blocked"}),()=>({status:"error"}),()=>{throw new Error("scoring unavailable");},r=>({...scoreTki(r),handler_version:"legacy"})]){
    const s=await setup(t,{score});s.save();const before=domain(s.db);assert.ok([422,500].includes((await s.finish()).status));assert.equal(domain(s.db),before);
  }
});
test("release artifact mismatch blocks completion instead of silently using current form",async t=>{
  const s=await setup(t);s.save();s.db.exec("DROP TRIGGER release_no_update"); // Test-only corruption, never application behavior.
  s.db.prepare("UPDATE instrument_releases SET form_digest=? WHERE id=?").run(sha256("changed fixture"),s.release);
  const before=domain(s.db),r=await s.finish();assert.equal(r.status,503);assert.equal((await r.json()).error,"RELEASE_UNAVAILABLE");assert.equal(domain(s.db),before);
});
test("file reopen and fresh login return the same result without recalculation or duplicate",async t=>{
  const directory=mkdtempSync(path.join(tmpdir(),"pedpsy-completion-test-")),filename=path.join(directory,"training.sqlite");let reopened,primary;
  t.after(()=>{for(const db of [primary,reopened])if(db?.isOpen)db.close();assert.equal(path.dirname(directory),path.resolve(tmpdir()));
    assert.ok(path.basename(directory).startsWith("pedpsy-completion-test-"));rmSync(directory,{recursive:true,force:true});});
  const s=await setup(t,{filename});primary=s.db;s.save();const old=(await (await s.finish()).json()).completion;
  // Close this helper's HTTP server before reopening the file; the final hook is idempotent.
  s.db.close();reopened=openDatabase(filename);assert.equal(migrate(reopened),0);
  const access=createParticipantAccess(reopened,{now:s.now}),completion=createCompletionStore(reopened,access,{now:s.now,score:()=>{throw new Error("must not recalculate");}});
  const login=await access.login({login_id:s.actors[0].login_id,password:PASSWORD});assert.deepEqual(completion.read(login.token,s.actors[0].id),old);
  assert.deepEqual(completion.complete(login.token,s.actors[0].id,{expected_revision:2},login.csrf_token),old);
  assert.equal(reopened.prepare("SELECT count(*) n FROM attempt_results").get().n,1);
});
