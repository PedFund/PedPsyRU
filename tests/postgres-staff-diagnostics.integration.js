"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict"),{randomUUID,randomBytes}=require("node:crypto");
const {postgresFixture}=require("./postgres-fixture.js"),{verifiedStaff}=require("./mfa-fixture.js"),{participantService}=require("./participation-fixture.js");
const {PostgresStaffDiagnostics}=require("../dist/src/adapters/postgres/staff-diagnostics.js"),{PostgresResearcherGateway,PostgresResearcherManagement}=require("../dist/src/adapters/postgres/researchers.js");
const {sha256}=require("../storage/database.js"),{responses}=require("./storage-contract-suite.js");
function scenario(name,fn){test("PostgreSQL staff diagnostics: "+name,async t=>{const f=await postgresFixture({runtimePoolSize:2});t.after(()=>f.close());await fn(f,new PostgresStaffDiagnostics(f.runtime));});}
scenario("both actual MFA roles read/download every study with original stored result",async(f,d)=>{
  const p=await participantService(f),result=await p.complete();for(const role of ["administrator","superadministrator"]){const s=await verifiedStaff(f,role);
    assert.equal((await d.list(s.session.token)).length,18);const record=await d.read(s.session.token,p.id);assert.equal(record.responses.length,30);assert.equal(record.result.id,result.id);assert.deepEqual(record.result.measures.map(x=>x.value),result.payload.measures.map(x=>x.value));
    const all=await d.download(s.session.token);assert.equal(all.record_count,18);assert.equal(new Set(all.protocols.map(x=>x.study_id)).size,2);
    assert.equal((await d.download(s.session.token,p.id)).record_count,1);
    for(const forbidden of ["password_hash","salt","token_hash","secret_envelope","source_text","form_snapshot","key_digest","scales_definition"])assert.ok(!JSON.stringify(all).includes('"'+forbidden+'"'));
    const audit=(await f.admin.query("SELECT record_count,actor_role FROM pedpsy.access_audit_events WHERE credential_id=$1 AND action='protocols.download' ORDER BY at_ms",[s.id])).rows;
    assert.ok(audit.some(x=>x.record_count===18&&x.actor_role===role));
  }
  assert.equal((await f.admin.query("SELECT count(*)::integer n FROM pedpsy.attempt_results")).rows[0].n,1);
});
scenario("participant/researcher/pending/revoked cannot read or download staff diagnostics",async(f,d)=>{
  const s=await verifiedStaff(f),g=new PostgresResearcherGateway(f.runtime),m=new PostgresResearcherManagement(f.runtime),i=await m.invite(s.session.token),pw=randomBytes(24).toString("base64url");await g.accept({invite_code:i.invite_code,password:pw});const r=await g.login({login_id:i.login_id,password:pw});
  const pending=await s.gateway.password({login_id:s.login,password:s.password});for(const token of [f.raw,r.token,pending.challenge,randomBytes(32).toString("base64url"),""]){await assert.rejects(d.list(token),e=>e.status===401);await assert.rejects(d.download(token),e=>e.status===401);}
  await f.admin.query("UPDATE pedpsy.staff_credentials SET version=version+1 WHERE id=$1",[s.id]);await assert.rejects(d.download(s.session.token),e=>e.status===401);
});
scenario("fresh proof for export, uniform missing ID and closed-study visibility",async(f,d)=>{
  const s=await verifiedStaff(f,"administrator");await f.admin.query("UPDATE pedpsy.studies SET status='closed' WHERE id=$1",[f.studyId]);assert.equal((await d.download(s.session.token)).record_count,18);
  for(const id of [randomUUID(),"bad-id"])await assert.rejects(d.read(s.session.token,id),e=>e.status===404&&e.code==="NOT_AVAILABLE");
  await f.admin.query("UPDATE pedpsy.staff_sessions SET created_at_ms=created_at_ms-360000,mfa_verified_at=mfa_verified_at-interval '6 minutes' WHERE token_hash=$1",[sha256(s.session.token)]);await d.list(s.session.token);await assert.rejects(d.download(s.session.token),e=>e.code==="MFA_RECHECK_REQUIRED");
});
scenario("concurrent participant save/completion gives self-consistent immutable snapshots",async(f,d)=>{
  const s=await verifiedStaff(f),p=await participantService(f),old=await p.service.read(p.context,p.id);
  const save=p.service.save(p.context,p.id,{expected_revision:old.revision,current_item_id:"q30",responses:responses()});
  const snapshots=await Promise.all(Array.from({length:6},()=>d.download(s.session.token,p.id)));await save;
  for(const x of snapshots){const r=x.protocols[0];assert.ok(r.revision===old.revision&&r.responses.length===old.responses.length||r.revision===old.revision+1&&r.responses.length===30);}
  const complete=p.service.complete(p.context,p.id,{expected_revision:old.revision+1}),r=await d.read(s.session.token,p.id);await complete;assert.equal(r.status==="completed",r.result!==null);
  await f.withSession(async c=>assert.equal((await c.query("UPDATE pedpsy.attempts SET revision=revision+1")).rowCount,0),sha256(s.session.token));
});
scenario("mandatory audit failure prevents any successful diagnostic/export response",async(f,d)=>{
  const s=await verifiedStaff(f);await f.admin.query("CREATE FUNCTION pedpsy.synthetic_export_audit_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic audit failure'; END $$;CREATE TRIGGER synthetic_export_audit_fail BEFORE INSERT ON pedpsy.access_audit_events FOR EACH ROW EXECUTE FUNCTION pedpsy.synthetic_export_audit_fail()");
  await assert.rejects(d.download(s.session.token),/synthetic audit failure/);await assert.rejects(d.read(s.session.token,f.seed.studies[0].attempts[0].id),/synthetic audit failure/);
  assert.equal((await f.admin.query("SELECT count(*)::integer n FROM pedpsy.attempts")).rows[0].n,18);
});
scenario("export cardinality and byte limits refuse whole response, never truncate",async(f,d)=>{
  const s=await verifiedStaff(f),base=(await f.admin.query("SELECT * FROM pedpsy.attempts LIMIT 1")).rows[0];
  const add=n=>f.admin.query("WITH p AS (INSERT INTO pedpsy.participants(id,study_id,display_code) SELECT gen_random_uuid(),$1,gen_random_uuid()::text FROM generate_series(1,$6::integer) RETURNING id),e AS (INSERT INTO pedpsy.stage_enrollments(id,study_id,participant_id,group_id,stage_id) SELECT gen_random_uuid(),$1,p.id,$2,$3 FROM p RETURNING id) INSERT INTO pedpsy.attempts(id,study_id,enrollment_id,assignment_id,release_id,group_id,stage_id,current_item_id) SELECT gen_random_uuid(),$1,e.id,$4,$5,$2,$3,'q01' FROM e",[base.study_id,base.group_id,base.stage_id,base.assignment_id,base.release_id,n]);
  await add(482); // Exactly 500; byte cap is exercised independently of count.
  await f.admin.query("UPDATE pedpsy.participants SET display_code=repeat('x',10000)||id::text");await assert.rejects(d.download(s.session.token),e=>e.code==="EXPORT_LIMIT");
  await f.admin.query("UPDATE pedpsy.participants SET display_code=id::text");assert.equal((await d.download(s.session.token)).record_count,500);
  await add(1);
  await assert.rejects(d.download(s.session.token),e=>e.code==="EXPORT_LIMIT");await assert.rejects(d.list(s.session.token),e=>e.code==="EXPORT_LIMIT");assert.equal((await d.download(s.session.token,base.id)).record_count,1);
});
