"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict"),{randomUUID}=require("node:crypto");
const {postgresFixture}=require("./postgres-fixture.js"),{verifiedStaff}=require("./mfa-fixture.js"),{studyResearcher}=require("./study-fixture.js");
const {workspaceFixture,headers}=require("./workspace-fixture.js"),{csrfFor}=require("../storage/access.js"),{tokenHash}=require("../dist/src/adapters/postgres/account-transaction.js");
const {PostgresStageAccess}=require("../dist/src/adapters/postgres/stage-access.js");
async function configured(f,s,active=true){const x=await studyResearcher(f,s);let d=await x.studies.create(x.session.token,"Synthetic stage access");
  d=await x.studies.group(x.session.token,d.id,undefined,{name:"КГ",kind:"control",expected_version:d.version});
  for(const g of d.groups)d=await x.studies.assign(x.session.token,d.id,{group_id:g.id,stage_id:d.stages[0].id,release_ids:[f.seed.release_id],expected_version:d.version});
  for(const [code,ordinal] of [["T1",1],["T2",2]])d=await x.studies.copy(x.session.token,d.id,{source_stage_id:d.stages[0].id,code,ordinal,expected_version:d.version});
  if(active)d=await x.studies.lifecycle(x.session.token,d.id,{status:"active",expected_version:d.version});
  return {...x,d,access:new PostgresStageAccess(f.runtime)};
}
function scenario(name,fn){test("PostgreSQL group stage access: "+name,async t=>{const f=await postgresFixture({runtimePoolSize:2}),s=await verifiedStaff(f),w=workspaceFixture(f);t.after(async()=>{await w.app.close();await f.close();});await fn(f,s,w);});}
const open=(x,token=x.session.token,group=x.d.groups[0].id,stage=x.d.stages[0].id,revision=0)=>x.access.open(token,x.d.id,group,stage,{expected_revision:revision});
const count=async f=>(await f.admin.query("SELECT count(*)::integer n FROM pedpsy.group_stage_access")).rows[0].n;
scenario("activation leaves all groups/stages not open; independent T0/T1 persisted without enrollments or design writes",async(f,s)=>{
  const x=await configured(f,s),before=await x.studies.read(x.session.token,x.d.id);
  for(const g of x.d.groups){const rows=await x.access.list(x.session.token,x.d.id,g.id);assert.equal(rows.length,3);assert.ok(rows.every(r=>r.status==="not_open"&&r.revision===0&&r.id===null));}
  const r=await open(x);assert.equal(r.status,"open");assert.equal(r.revision,1);assert.ok(r.opened_at>0);
  await open(x,x.session.token,x.d.groups[1].id,x.d.stages[1].id);
  const kg=await new PostgresStageAccess(f.runtime).list(x.session.token,x.d.id,x.d.groups[0].id),eg=await x.access.list(x.session.token,x.d.id,x.d.groups[1].id);
  assert.deepEqual(kg.map(r=>r.status),["open","not_open","not_open"]);assert.deepEqual(eg.map(r=>r.status),["not_open","open","not_open"]);
  assert.deepEqual(await x.studies.read(x.session.token,x.d.id),before);
  for(const table of ["participants","stage_enrollments","attempts"])assert.equal((await f.admin.query(`SELECT count(*)::integer n FROM pedpsy.${table} WHERE study_id=$1`,[x.d.id])).rows[0].n,0);
  assert.equal((await f.admin.query("SELECT count(*)::integer n FROM pedpsy.attempts")).rows[0].n,18); // Existing legacy synthetic attempts survive.
});
scenario("owner and staff race yields one opening; explicit current revision replay preserves identity/time",async(f,s)=>{
  const x=await configured(f,s),results=await Promise.allSettled([x.session.token,s.session.token].map(token=>open(x,token)));
  assert.equal(results.filter(r=>r.status==="fulfilled").length,1);assert.equal(results.find(r=>r.status==="rejected").reason.code,"STAGE_ACCESS_CONFLICT");
  const winner=results.find(r=>r.status==="fulfilled").value;assert.deepEqual(await open(x,x.session.token,undefined,undefined,1),winner);assert.equal(await count(f),1);
  await assert.rejects(open(x),e=>e.status===409&&e.code==="STAGE_ACCESS_CONFLICT");
  assert.equal((await f.admin.query("SELECT count(*)::integer n FROM pedpsy.access_audit_events WHERE study_id=$1 AND action='stages.open'",[x.d.id])).rows[0].n,2);
});
for(const role of ["administrator","superadministrator"])scenario(role+" global HTTP opening uses real actor, exact DTO and independent group metadata",async(f,s,w)=>{
  const x=await configured(f,s),staff=role===s.role?s:await verifiedStaff(f,role),h={...headers,cookie:"pedpsy_staff_demo="+staff.session.token,"x-pedpsy-csrf":csrfFor(staff.session.token)};
  const base="/api/v2/staff/studies/"+x.d.id+"/groups/"+x.d.groups[1].id+"/stage-access",url=base+"/"+x.d.stages[1].id+"/open";
  for(const body of [{expected_revision:0,actor_role:role},{expected_revision:"0"},{expected_revision:2}])assert.equal((await w.app.inject({method:"POST",url,headers:h,payload:body})).statusCode,400);
  for(const change of [{origin:"https://foreign.test"},{"x-pedpsy-csrf":"bad"},{cookie:"pedpsy_staff_demo="+x.session.token},{cookie:"pedpsy_staff_demo="+f.raw}])assert.ok([401,403].includes((await w.app.inject({method:"POST",url,headers:{...h,...change},payload:{expected_revision:0}})).statusCode));
  const reply=await w.app.inject({method:"POST",url,headers:h,payload:{expected_revision:0}});assert.equal(reply.statusCode,200,reply.body);const r=reply.json();assert.equal(r.status,"open");assert.equal(Object.keys(r).length,7);
  const saved=(await f.admin.query("SELECT opened_by_staff,opened_by_researcher FROM pedpsy.group_stage_access WHERE id=$1",[r.id])).rows[0];assert.deepEqual(saved,{opened_by_staff:staff.id,opened_by_researcher:null});
  const audit=(await f.admin.query("SELECT credential_id,actor_role,resource_id FROM pedpsy.access_audit_events WHERE study_id=$1 AND action='stages.open'",[x.d.id])).rows;assert.deepEqual(audit,[{credential_id:staff.id,actor_role:role,resource_id:r.id}]);
  assert.equal((await w.app.inject({url:base,headers:h})).json().find(r=>r.stage_id===x.d.stages[1].id).status,"open");
  assert.equal((await x.access.list(x.session.token,x.d.id,x.d.groups[0].id)).find(r=>r.stage_id===x.d.stages[1].id).status,"not_open");
  const researcherUrl=url.replace("/staff/","/researcher/"),rh={...headers,cookie:"pedpsy_researcher_demo="+x.session.token,"x-pedpsy-csrf":csrfFor(x.session.token)};
  assert.equal((await w.app.inject({method:"POST",url:researcherUrl,headers:rh,payload:{expected_revision:1}})).statusCode,200);
  assert.equal((await w.app.inject({method:"POST",url:researcherUrl,headers:{...h,cookie:"pedpsy_researcher_demo="+staff.session.token},payload:{expected_revision:1}})).statusCode,401);
});
scenario("draft/closed/cross-scope/foreign researcher/participant denied, current MFA required only for staff writes",async(f,s)=>{
  const x=await configured(f,s,false);await assert.rejects(open(x),e=>e.status===404);assert.ok((await x.access.list(x.session.token,x.d.id,x.d.groups[0].id)).every(r=>r.status==="not_open"));
  x.d=await x.studies.lifecycle(x.session.token,x.d.id,{status:"active",expected_version:x.d.version});const other=await studyResearcher(f,s);
  await assert.rejects(open(x,other.session.token),e=>e.status===404);await assert.rejects(x.access.list(other.session.token,x.d.id,x.d.groups[0].id),e=>e.status===404);
  await assert.rejects(open(x,f.raw),e=>e.status===401);await assert.rejects(open(x,x.session.token,randomUUID()),e=>e.status===404);
  await assert.rejects(open(x,x.session.token,undefined,f.seed.studies[0].stages[0].id),e=>e.status===404);
  await f.admin.query("UPDATE pedpsy.staff_sessions SET created_at_ms=$2::bigint,mfa_verified_at=to_timestamp($2::bigint/1000.0) WHERE token_hash=$1",[tokenHash(s.session.token),Date.now()-360000]);
  await assert.rejects(open(x,s.session.token),e=>e.code==="MFA_RECHECK_REQUIRED");assert.equal((await x.access.list(s.session.token,x.d.id,x.d.groups[0].id)).length,3);
  await x.studies.lifecycle(x.session.token,x.d.id,{status:"closed",expected_version:x.d.version});await assert.rejects(open(x),e=>e.status===404);assert.equal(await count(f),0);
});
scenario("runtime has no direct DML/read/private helper; history, creator and group/stage FKs immutable",async(f,s)=>{
  const x=await configured(f,s),r=await open(x);
  for(const sql of ["SELECT * FROM pedpsy.group_stage_access","DELETE FROM pedpsy.group_stage_access","UPDATE pedpsy.group_stage_access SET revision=1","SELECT pedpsy.group_stage_access_record(gen_random_uuid(),gen_random_uuid(),gen_random_uuid())","SELECT pedpsy.stage_access_audit('x',gen_random_uuid(),gen_random_uuid())","SELECT pedpsy.guard_group_stage_access()"])
    await assert.rejects(f.runtime.query(sql),e=>e.code==="42501");
  await assert.rejects(f.admin.query("UPDATE pedpsy.group_stage_access SET opened_by_staff=$2,opened_by_researcher=NULL WHERE id=$1",[r.id,s.id]),e=>e.code==="23514");
  await assert.rejects(f.admin.query("DELETE FROM pedpsy.group_stage_access WHERE id=$1",[r.id]),e=>e.code==="23514");
  await assert.rejects(f.admin.query("INSERT INTO pedpsy.group_stage_access(id,study_id,group_id,stage_id,opened_at_ms,opened_by_researcher) VALUES(gen_random_uuid(),$1,$2,$3,0,$4)",[x.d.id,randomUUID(),x.d.stages[0].id,x.row.id]),e=>e.code==="23503");
  assert.equal(await count(f),1);
});
scenario("current closed group/stage or empty assignment cell cannot be opened",async(f,s)=>{
  const x=await configured(f,s);
  for(const [table,id] of [["research_groups",x.d.groups[0].id],["research_stages",x.d.stages[0].id],["assignments",x.d.assignments.find(a=>a.group_id===x.d.groups[0].id&&a.stage_id===x.d.stages[0].id).id]]){
    await f.admin.query(`UPDATE pedpsy.${table} SET status='closed' WHERE id=$1`,[id]);await assert.rejects(open(x),e=>e.status===404);
    await f.admin.query(`UPDATE pedpsy.${table} SET status='active' WHERE id=$1`,[id]);
  }
  assert.equal(await count(f),0);assert.equal((await open(x)).status,"open");
});
scenario("mandatory audit failure rolls back opening and exposes no successful HTTP response",async(f,s,w)=>{
  const x=await configured(f,s);await f.admin.query("CREATE FUNCTION pedpsy.synthetic_stage_audit_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.reason='STAGE_ACCESS' THEN RAISE EXCEPTION 'synthetic audit failure'; END IF; RETURN NEW; END $$;CREATE TRIGGER synthetic_stage_audit_fail BEFORE INSERT ON pedpsy.access_audit_events FOR EACH ROW EXECUTE FUNCTION pedpsy.synthetic_stage_audit_fail()");
  await assert.rejects(open(x),/synthetic audit failure/);await assert.rejects(x.access.list(x.session.token,x.d.id,x.d.groups[0].id),/synthetic audit failure/);
  const url="/api/v2/staff/studies/"+x.d.id+"/groups/"+x.d.groups[0].id+"/stage-access/"+x.d.stages[0].id+"/open";
  assert.equal((await w.app.inject({method:"POST",url,headers:{...headers,cookie:"pedpsy_staff_demo="+s.session.token,"x-pedpsy-csrf":csrfFor(s.session.token)},payload:{expected_revision:0}})).statusCode,500);assert.equal(await count(f),0);
});
async function waitForOpen(f){const until=Date.now()+2000;while(Date.now()<until){if((await f.admin.query("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=$1 AND wait_event_type='Lock' AND query LIKE '%open_group_stage%') waiting",[f.database])).rows[0].waiting)return;await new Promise(r=>setTimeout(r,10));}assert.fail("stage opening did not reach lock wait");}
for(const mutation of ["staff revocation","membership","closure"])scenario(mutation+" during lock wait is rechecked before opening or allow audit",async(f,s)=>{
  const x=await configured(f,s),owner=await f.admin.connect();let pending;
  try{await owner.query("BEGIN");if(mutation==="staff revocation")await owner.query("SELECT id FROM pedpsy.staff_credentials WHERE id=$1 FOR UPDATE",[s.id]);else await owner.query("SELECT id FROM pedpsy.studies WHERE id=$1 FOR UPDATE",[x.d.id]);
    pending=open(x,s.session.token).then(value=>({value}),error=>({error}));await waitForOpen(f);
    if(mutation==="staff revocation")await owner.query("UPDATE pedpsy.staff_credentials SET status='revoked',version=version+1 WHERE id=$1",[s.id]);
    else if(mutation==="membership")await owner.query("UPDATE pedpsy.study_memberships SET status='revoked' WHERE study_id=$1 AND user_id=$2",[x.d.id,x.row.user_id]);else await owner.query("UPDATE pedpsy.studies SET status='closed' WHERE id=$1",[x.d.id]);
    await owner.query("COMMIT");assert.equal((await pending).error?.status,mutation==="staff revocation"?401:404);
  }finally{await owner.query("ROLLBACK");owner.release();if(pending)await pending;}
  assert.equal(await count(f),0);assert.equal((await f.admin.query("SELECT count(*)::integer n FROM pedpsy.access_audit_events WHERE study_id=$1 AND action='stages.open'",[x.d.id])).rows[0].n,0);
});
scenario("50 stages returned exactly; 51 explicitly refused, never truncated",async(f,s)=>{
  const x=await configured(f,s,false);
  await f.admin.query("INSERT INTO pedpsy.research_stages(id,study_id,code,ordinal) SELECT gen_random_uuid(),$1,'Extra '||n::text,n FROM generate_series(3,49) n",[x.d.id]);
  assert.equal((await x.access.list(x.session.token,x.d.id,x.d.groups[0].id)).length,50);
  await f.admin.query("INSERT INTO pedpsy.research_stages(id,study_id,code,ordinal) VALUES(gen_random_uuid(),$1,'Extra fifty',50)",[x.d.id]);
  await assert.rejects(x.access.list(x.session.token,x.d.id,x.d.groups[0].id),e=>e.status===413&&e.code==="DESIGN_LIMIT");
});
