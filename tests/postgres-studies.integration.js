"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict"),{randomUUID}=require("node:crypto");
const {postgresFixture}=require("./postgres-fixture.js"),{verifiedStaff}=require("./mfa-fixture.js"),{studyResearcher}=require("./study-fixture.js"),{PostgresStudyConstructor}=require("../dist/src/adapters/postgres/studies.js");
function scenario(name,fn){test("PostgreSQL constructor: "+name,async t=>{const f=await postgresFixture({runtimePoolSize:2});t.after(()=>f.close());const staff=await verifiedStaff(f),x=await studyResearcher(f,staff);await fn(f,x,staff);});}
scenario("create draft/membership/version/audit atomically; only own metadata and both staff global read",async(f,x,s)=>{
  const d=await x.studies.create(x.session.token,"Синтетическое исследование");assert.equal(d.version,0);assert.equal(d.status,"draft");assert.deepEqual(d.groups,[]);assert.equal(d.dataset_kind,"demo");assert.equal((await x.gateway.home(x.session.token)).studies[0].id,d.id);
  assert.deepEqual(await x.studies.read(x.session.token,d.id),d);assert.deepEqual(await x.studies.read(s.session.token,d.id),d);
  const admin=await verifiedStaff(f,"administrator");assert.deepEqual(await x.studies.read(admin.session.token,d.id),d);
  await assert.rejects(x.studies.create(s.session.token,"Staff may not configure"),e=>e.status===401);
  const y=await studyResearcher(f,s);for(const id of [d.id,f.studyId,randomUUID()])await assert.rejects(y.studies.read(y.session.token,id),e=>e.status===404);
  assert.equal((await f.admin.query("SELECT count(*)::integer n FROM pedpsy.access_audit_events WHERE action='studies.create' AND resource_id=$1",[d.id])).rows[0].n,1);
  const text=JSON.stringify(d);for(const name of ["responses","payload","key_digest","password_hash","source_text"])assert.ok(!text.includes(name));
});
scenario("runtime cannot call private snapshots/helpers or bypass fixed authority",async(f,x)=>{
  const d=await x.studies.create(x.session.token,"Test");
  for(const sql of ["SELECT pedpsy.study_design_snapshot($1)","SELECT pedpsy.lock_study_design($1,true,0)","UPDATE pedpsy.studies SET title='bypass' WHERE id=$1","INSERT INTO pedpsy.study_memberships(study_id,user_id,role) VALUES($1,gen_random_uuid(),'researcher')"])
    await assert.rejects(f.runtime.query(sql,[d.id]),e=>e.code==="42501");
  await assert.rejects(new PostgresStudyConstructor(f.runtime).read(f.raw,d.id),e=>e.status===401);
  await x.management.block((await verifiedStaff(f)).session.token,x.row.id);await assert.rejects(x.studies.read(x.session.token,d.id),e=>e.status===401);
});
scenario("mandatory audit failure rolls back creation and membership",async(f,x)=>{
  const before=(await f.admin.query("SELECT count(*)::integer n FROM pedpsy.studies")).rows[0].n;
  await f.admin.query("CREATE FUNCTION pedpsy.synthetic_constructor_audit_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic constructor audit failure'; END $$;CREATE TRIGGER synthetic_constructor_audit_fail BEFORE INSERT ON pedpsy.access_audit_events FOR EACH ROW EXECUTE FUNCTION pedpsy.synthetic_constructor_audit_fail()");
  await assert.rejects(x.studies.create(x.session.token,"Rollback"),/synthetic constructor audit failure/);assert.equal((await f.admin.query("SELECT count(*)::integer n FROM pedpsy.studies")).rows[0].n,before);
  assert.equal((await f.admin.query("SELECT count(*)::integer n FROM pedpsy.study_memberships WHERE user_id=$1",[x.row.user_id])).rows[0].n,0);
});
scenario("group kinds, uniqueness, scope and concurrent compare-and-swap",async(f,x,s)=>{
  let d=await x.studies.create(x.session.token,"Groups");
  for(const [name,kind] of [["КГ","control"],["ЭГ","experimental"],["Другая","other"]])d=await x.studies.group(x.session.token,d.id,undefined,{name,kind,expected_version:d.version});
  assert.equal(d.groups.length,3);assert.equal(d.version,3);
  const result=await Promise.allSettled(["Первое","Второе"].map(name=>x.studies.group(x.session.token,d.id,d.groups[0].id,{name,kind:"control",expected_version:3})));
  assert.equal(result.filter(r=>r.status==="fulfilled").length,1);assert.equal(result.find(r=>r.status==="rejected").reason.code,"DESIGN_CONFLICT");
  d=await x.studies.read(x.session.token,d.id);await assert.rejects(x.studies.group(x.session.token,d.id,undefined,{name:"ЭГ",kind:"other",expected_version:d.version}),e=>e.code==="DESIGN_DUPLICATE");
  const foreign=f.seed.studies[0].groups[0].id;await assert.rejects(x.studies.group(x.session.token,d.id,foreign,{name:"Foreign",kind:"control",expected_version:d.version}),e=>e.status===404);
  await assert.rejects(x.studies.group(s.session.token,d.id,undefined,{name:"Staff",kind:"other",expected_version:d.version}),e=>e.status===403);
  const y=await studyResearcher(f,s);await assert.rejects(y.studies.group(y.session.token,d.id,undefined,{name:"Foreign",kind:"other",expected_version:d.version}),e=>e.status===404);
});
scenario("T0/T1/T2/custom stage ordering and duplicate/cross-study/version denial",async(f,x)=>{
  let d=await x.studies.create(x.session.token,"Stages");for(const [ordinal,code] of ["T0","T1","T2","Отсроченный этап"].entries())d=await x.studies.stage(x.session.token,d.id,undefined,{code,ordinal,expected_version:d.version});
  assert.deepEqual(d.stages.map(s=>s.ordinal),[0,1,2,3]);assert.equal(d.stages.length,4);
  for(const input of [{code:"t0",ordinal:4},{code:"Other",ordinal:2}])await assert.rejects(x.studies.stage(x.session.token,d.id,undefined,{...input,expected_version:d.version}),e=>e.code==="DESIGN_DUPLICATE");
  await assert.rejects(x.studies.stage(x.session.token,d.id,f.seed.studies[0].stages[0].id,{code:"Other",ordinal:4,expected_version:d.version}),e=>e.status===404);
  d=await x.studies.stage(x.session.token,d.id,d.stages[3].id,{code:"Отсроченный",ordinal:8,expected_version:d.version});assert.equal(d.stages.at(-1).ordinal,8);
  await assert.rejects(x.studies.stage(x.session.token,d.id,undefined,{code:"Stale",ordinal:9,expected_version:d.version-1}),e=>e.code==="DESIGN_CONFLICT");
});
scenario("each group/stage has its own pinned synthetic method set, not science approval",async(f,x)=>{
  let d=await x.studies.create(x.session.token,"Methods");assert.equal(d.catalog.length,1);assert.equal(d.catalog[0].publication_state,"draft");assert.equal(d.catalog[0].verification_state,"key_verified");
  for(const name of ["КГ","ЭГ"])d=await x.studies.group(x.session.token,d.id,undefined,{name,kind:name==="КГ"?"control":"experimental",expected_version:d.version});
  d=await x.studies.stage(x.session.token,d.id,undefined,{code:"T0",ordinal:0,expected_version:d.version});
  const cell={group_id:d.groups[0].id,stage_id:d.stages[0].id,release_ids:[f.seed.release_id]};
  d=await x.studies.assign(x.session.token,d.id,{...cell,expected_version:d.version});assert.equal(d.assignments.length,1);assert.equal(d.assignments[0].group_id,cell.group_id);assert.equal(d.assignments[0].release_id,f.seed.release_id);
  const preserved=d.assignments[0].id;d=await x.studies.assign(x.session.token,d.id,{...cell,expected_version:d.version});assert.equal(d.assignments[0].id,preserved);
  for(const bad of [{...cell,release_ids:[randomUUID()]},{...cell,group_id:f.seed.studies[1].groups[0].id},{...cell,stage_id:f.seed.studies[1].stages[0].id}])await assert.rejects(x.studies.assign(x.session.token,d.id,{...bad,expected_version:d.version}),e=>e.status===404);
  d=await x.studies.assign(x.session.token,d.id,{...cell,release_ids:[],expected_version:d.version});assert.equal(d.assignments.length,0);
  for(const privateName of ["source_text","key_digest","form_snapshot","scales","responses"])assert.ok(!JSON.stringify(d).includes(privateName));
});
scenario("copy settings per group only, independent IDs and no participants/answers/results",async(f,x)=>{
  const {participantService}=require("./participation-fixture.js"),p=await participantService(f);await p.complete();
  const counts=async()=>{const out={};for(const table of ["participants","stage_enrollments","attempts","responses","attempt_results"])out[table]=(await f.admin.query("SELECT count(*)::integer n FROM pedpsy."+table)).rows[0].n;return out;},before=await counts();
  let d=await x.studies.create(x.session.token,"Copy");for(const name of ["КГ","ЭГ"])d=await x.studies.group(x.session.token,d.id,undefined,{name,kind:"other",expected_version:d.version});
  d=await x.studies.stage(x.session.token,d.id,undefined,{code:"T0",ordinal:0,expected_version:d.version});const source=d.stages[0].id;
  d=await x.studies.assign(x.session.token,d.id,{group_id:d.groups[0].id,stage_id:source,release_ids:[f.seed.release_id],expected_version:d.version});const sourceAssignment=d.assignments[0].id;
  d=await x.studies.copy(x.session.token,d.id,{source_stage_id:source,code:"T1",ordinal:1,expected_version:d.version});const copied=d.stages[1].id;assert.equal(d.stages[1].based_on_stage_id,source);
  assert.equal(d.assignments.filter(a=>a.stage_id===copied).length,1);assert.notEqual(d.assignments.find(a=>a.stage_id===copied).id,sourceAssignment);assert.equal(d.assignments.find(a=>a.stage_id===copied).group_id,d.groups[0].id);assert.deepEqual(await counts(),before);
  d=await x.studies.assign(x.session.token,d.id,{group_id:d.groups[0].id,stage_id:source,release_ids:[],expected_version:d.version});assert.equal(d.assignments.filter(a=>a.stage_id===copied).length,1);
  await assert.rejects(x.studies.copy(x.session.token,d.id,{source_stage_id:randomUUID(),code:"T2",ordinal:2,expected_version:d.version}),e=>e.status===404);
  await assert.rejects(x.studies.copy(x.session.token,d.id,{source_stage_id:f.seed.studies[1].stages[0].id,code:"T2",ordinal:2,expected_version:d.version}),e=>e.status===404);
  await assert.rejects(x.studies.stage(x.session.token,d.id,source,{code:"T0",ordinal:3,expected_version:d.version}),e=>e.status===400);
  await f.admin.query("CREATE FUNCTION pedpsy.synthetic_copy_audit_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic copy audit failure'; END $$;CREATE TRIGGER synthetic_copy_audit_fail BEFORE INSERT ON pedpsy.access_audit_events FOR EACH ROW EXECUTE FUNCTION pedpsy.synthetic_copy_audit_fail()");
  await assert.rejects(x.studies.copy(x.session.token,d.id,{source_stage_id:copied,code:"T2",ordinal:2,expected_version:d.version}),/synthetic copy audit failure/);
  assert.equal((await f.admin.query("SELECT design_version FROM pedpsy.studies WHERE id=$1",[d.id])).rows[0].design_version,d.version);assert.equal((await f.admin.query("SELECT count(*)::integer n FROM pedpsy.research_stages WHERE study_id=$1",[d.id])).rows[0].n,2);assert.deepEqual(await counts(),before);
});
async function readyStudy(x,f,title){let d=await x.studies.create(x.session.token,title);d=await x.studies.group(x.session.token,d.id,undefined,{name:"КГ",kind:"control",expected_version:d.version});d=await x.studies.stage(x.session.token,d.id,undefined,{code:"T0",ordinal:0,expected_version:d.version});return x.studies.assign(x.session.token,d.id,{group_id:d.groups[0].id,stage_id:d.stages[0].id,release_ids:[f.seed.release_id],expected_version:d.version});}
scenario("activation completeness, atomic active quota race, closed frees quota but never rewrites design",async(f,x,s)=>{
  const incomplete=await x.studies.create(x.session.token,"Incomplete");await assert.rejects(x.studies.lifecycle(x.session.token,incomplete.id,{status:"active",expected_version:0}),e=>e.code==="DESIGN_INCOMPLETE");
  const drafts=await Promise.all(["One","Two"].map(title=>readyStudy(x,f,title)));const result=await Promise.allSettled(drafts.map(d=>x.studies.lifecycle(x.session.token,d.id,{status:"active",expected_version:d.version})));
  assert.equal(result.filter(r=>r.status==="fulfilled").length,1);assert.equal(result.find(r=>r.status==="rejected").reason.code,"STUDY_QUOTA");
  let active=result.find(r=>r.status==="fulfilled").value;await assert.rejects(x.studies.title(x.session.token,active.id,{title:"Changed",expected_version:active.version}),e=>e.code==="DESIGN_FROZEN");
  await assert.rejects(x.studies.assign(x.session.token,active.id,{group_id:active.groups[0].id,stage_id:active.stages[0].id,release_ids:[],expected_version:active.version}),e=>e.code==="DESIGN_FROZEN");
  await assert.rejects(x.studies.lifecycle(s.session.token,active.id,{status:"closed",expected_version:active.version}),e=>e.status===401);
  active=await x.studies.lifecycle(x.session.token,active.id,{status:"closed",expected_version:active.version});assert.equal(active.status,"closed");await assert.rejects(x.studies.lifecycle(x.session.token,active.id,{status:"active",expected_version:active.version}),e=>e.code==="DESIGN_FROZEN");
  const other=drafts.find(d=>d.id!==active.id),second=await x.studies.lifecycle(x.session.token,other.id,{status:"active",expected_version:other.version});assert.equal(second.status,"active");
  const renamed=await x.studies.title(x.session.token,incomplete.id,{title:"Новое название",expected_version:0});assert.equal(renamed.title,"Новое название");assert.equal(renamed.version,1);
});
scenario("close waits for participant scope writer; afterwards participant save is denied",async(f,x)=>{
  const {participantService}=require("./participation-fixture.js"),p=await participantService(f);await f.admin.query("INSERT INTO pedpsy.study_memberships(study_id,user_id,role) VALUES($1,$2,'researcher')",[f.studyId,x.row.user_id]);
  const c=await f.runtime.connect();let closing;try{await c.query("BEGIN");await c.query("SELECT set_config('app.session_hash',$1,true)",[f.hash]);await c.query("SELECT pedpsy.lock_participant_scope($1)",[p.id]);
    let settled=false;closing=x.studies.lifecycle(x.session.token,f.studyId,{status:"closed",expected_version:0});closing.then(()=>settled=true,()=>settled=true);
    const deadline=Date.now()+2000;let waiting=false;while(Date.now()<deadline){waiting=(await f.admin.query("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=$1 AND wait_event_type='Lock') waiting",[f.database])).rows[0].waiting;if(waiting)break;await new Promise(r=>setTimeout(r,10));}
    assert.equal(waiting,true);assert.equal(settled,false);await c.query("COMMIT");assert.equal((await closing).status,"closed");
  }finally{await c.query("ROLLBACK");c.release();if(closing)await closing.catch(()=>{});}
  await assert.rejects(p.service.read(p.context,p.id),e=>e.status===401);assert.equal((await f.admin.query("SELECT count(*)::integer n FROM pedpsy.responses WHERE attempt_id=$1",[p.id])).rows[0].n,2);
});
async function waitForConstructorLock(f){
  const deadline=Date.now()+2000;while(Date.now()<deadline){
    const waiting=(await f.admin.query("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=$1 AND wait_event_type='Lock' AND query LIKE '%configure_study_group%') waiting",[f.database])).rows[0].waiting;
    if(waiting)return;await new Promise(r=>setTimeout(r,10));
  }assert.fail("constructor did not reach the expected lock");
}
scenario("credential revocation committed during a lock wait prevents mutation and allow audit",async(f,x)=>{
  const d=await x.studies.create(x.session.token,"Revocation race"),owner=await f.admin.connect();let pending;
  try{await owner.query("BEGIN");await owner.query("SELECT id FROM pedpsy.researcher_credentials WHERE id=$1 FOR UPDATE",[x.row.id]);
    pending=x.studies.group(x.session.token,d.id,undefined,{name:"Denied",kind:"other",expected_version:0}).then(value=>({value}),error=>({error}));
    await waitForConstructorLock(f);await owner.query("UPDATE pedpsy.researcher_credentials SET status='revoked',version=version+1 WHERE id=$1",[x.row.id]);await owner.query("COMMIT");
    assert.equal((await pending).error?.status,401);
  }finally{await owner.query("ROLLBACK");owner.release();if(pending)await pending;}
  assert.equal((await f.admin.query("SELECT count(*)::integer n FROM pedpsy.research_groups WHERE study_id=$1",[d.id])).rows[0].n,0);
  assert.equal((await f.admin.query("SELECT design_version FROM pedpsy.studies WHERE id=$1",[d.id])).rows[0].design_version,0);
  assert.equal((await f.admin.query("SELECT count(*)::integer n FROM pedpsy.access_audit_events WHERE resource_id=$1 AND action='studies.groups' AND outcome='allow'",[d.id])).rows[0].n,0);
});
scenario("membership revocation committed while waiting for study lock is uniform unavailable",async(f,x)=>{
  const d=await x.studies.create(x.session.token,"Scope race"),owner=await f.admin.connect();let pending;
  try{await owner.query("BEGIN");await owner.query("SELECT id FROM pedpsy.studies WHERE id=$1 FOR UPDATE",[d.id]);
    pending=x.studies.group(x.session.token,d.id,undefined,{name:"Denied",kind:"other",expected_version:0}).then(value=>({value}),error=>({error}));
    await waitForConstructorLock(f);await owner.query("UPDATE pedpsy.study_memberships SET status='revoked' WHERE study_id=$1 AND user_id=$2",[d.id,x.row.user_id]);await owner.query("COMMIT");
    assert.equal((await pending).error?.status,404);
  }finally{await owner.query("ROLLBACK");owner.release();if(pending)await pending;}
  assert.equal((await f.admin.query("SELECT count(*)::integer n FROM pedpsy.research_groups WHERE study_id=$1",[d.id])).rows[0].n,0);
  assert.equal((await f.admin.query("SELECT design_version FROM pedpsy.studies WHERE id=$1",[d.id])).rows[0].design_version,0);
});
scenario("bounded groups/stages/owned studies and saturated version fail without partial writes",async(f,x)=>{
  let d=await x.studies.create(x.session.token,"Limits");
  await f.admin.query("INSERT INTO pedpsy.research_groups(id,study_id,name,kind) SELECT gen_random_uuid(),$1,'G'||n,'other' FROM generate_series(1,50) n",[d.id]);
  await f.admin.query("INSERT INTO pedpsy.research_stages(id,study_id,code,ordinal) SELECT gen_random_uuid(),$1,'T'||n,n FROM generate_series(0,49) n",[d.id]);
  d=await x.studies.read(x.session.token,d.id);assert.equal(d.groups.length,50);assert.equal(d.stages.length,50);
  for(const mutate of [()=>x.studies.group(x.session.token,d.id,undefined,{name:"51",kind:"other",expected_version:0}),
    ()=>x.studies.stage(x.session.token,d.id,undefined,{code:"T50",ordinal:50,expected_version:0}),
    ()=>x.studies.copy(x.session.token,d.id,{source_stage_id:d.stages[0].id,code:"Copy",ordinal:51,expected_version:0})])await assert.rejects(mutate,e=>e.code==="DESIGN_LIMIT");
  d=await x.studies.group(x.session.token,d.id,d.groups[0].id,{name:"Existing can be edited",kind:"control",expected_version:0});assert.equal(d.version,1);
  await f.admin.query("UPDATE pedpsy.studies SET design_version=2147483646 WHERE id=$1",[d.id]);
  await assert.rejects(x.studies.title(x.session.token,d.id,{title:"Must roll back",expected_version:2147483646}),e=>e.code==="DESIGN_LIMIT");
  assert.equal((await f.admin.query("SELECT title FROM pedpsy.studies WHERE id=$1",[d.id])).rows[0].title,"Limits");
  await f.admin.query("WITH added AS (INSERT INTO pedpsy.studies(id,title) SELECT gen_random_uuid(),'Synthetic limit '||n FROM generate_series(1,499) n RETURNING id) INSERT INTO pedpsy.study_memberships(study_id,user_id,role) SELECT id,$1,'researcher' FROM added",[x.row.user_id]);
  assert.equal((await x.gateway.home(x.session.token)).studies.length,500);await assert.rejects(x.studies.create(x.session.token,"501"),e=>e.code==="DESIGN_LIMIT");
  assert.equal((await f.admin.query("SELECT count(*)::integer n FROM pedpsy.study_memberships WHERE user_id=$1",[x.row.user_id])).rows[0].n,500);
});
scenario("lookalike release and malformed release sets cannot bypass the technical allowlist",async(f,x)=>{
  const d=await readyStudy(x,f,"Pinned release"),fake=randomUUID();
  // Owner-only adversarial fixture, not a published method or runtime mutation.
  await f.admin.query("INSERT INTO pedpsy.instrument_releases SELECT (jsonb_populate_record(NULL::pedpsy.instrument_releases,to_jsonb(r)||jsonb_build_object('id',$2::text,'form_id','synthetic-lookalike','form_digest','sha256:'||repeat('0',64)))).* FROM pedpsy.instrument_releases r WHERE id=$1",[f.seed.release_id,fake]);
  await f.admin.query("INSERT INTO pedpsy.release_items(release_id,item_id,ordinal,options) SELECT $2,item_id,ordinal,options FROM pedpsy.release_items WHERE release_id=$1",[f.seed.release_id,fake]);
  assert.equal((await x.studies.read(x.session.token,d.id)).catalog.some(r=>r.id===fake),false);
  const cell={group_id:d.groups[0].id,stage_id:d.stages[0].id,expected_version:d.version};
  await assert.rejects(x.studies.assign(x.session.token,d.id,{...cell,release_ids:[fake]}),e=>e.status===404);
  for(const release_ids of [[f.seed.release_id,f.seed.release_id],[null],Array.from({length:11},()=>randomUUID())])await assert.rejects(x.studies.assign(x.session.token,d.id,{...cell,release_ids}),e=>e.status===400);
  const after=await x.studies.read(x.session.token,d.id);assert.equal(after.version,d.version);assert.deepEqual(after.assignments,d.assignments);
});
scenario("activation and close audit failures roll back status/version/quota; repeats are idempotent",async(f,x)=>{
  let d=await readyStudy(x,f,"Lifecycle rollback");
  await f.admin.query("CREATE FUNCTION pedpsy.synthetic_lifecycle_audit_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='studies.lifecycle' THEN RAISE EXCEPTION 'synthetic lifecycle audit failure'; END IF;RETURN NEW;END $$;CREATE TRIGGER synthetic_lifecycle_audit_fail BEFORE INSERT ON pedpsy.access_audit_events FOR EACH ROW EXECUTE FUNCTION pedpsy.synthetic_lifecycle_audit_fail()");
  await assert.rejects(x.studies.lifecycle(x.session.token,d.id,{status:"active",expected_version:d.version}),/synthetic lifecycle audit failure/);
  assert.deepEqual(await x.studies.read(x.session.token,d.id),d);
  await f.admin.query("ALTER TABLE pedpsy.access_audit_events DISABLE TRIGGER synthetic_lifecycle_audit_fail");
  d=await x.studies.lifecycle(x.session.token,d.id,{status:"active",expected_version:d.version});const active=d;
  assert.deepEqual(await x.studies.lifecycle(x.session.token,d.id,{status:"active",expected_version:d.version}),active);
  await f.admin.query("ALTER TABLE pedpsy.access_audit_events ENABLE TRIGGER synthetic_lifecycle_audit_fail");
  await assert.rejects(x.studies.lifecycle(x.session.token,d.id,{status:"closed",expected_version:d.version}),/synthetic lifecycle audit failure/);
  assert.deepEqual(await x.studies.read(x.session.token,d.id),active);
  const other=await readyStudy(x,f,"Quota still occupied");await assert.rejects(x.studies.lifecycle(x.session.token,other.id,{status:"active",expected_version:other.version}),e=>e.code==="STUDY_QUOTA");
  await f.admin.query("DROP TRIGGER synthetic_lifecycle_audit_fail ON pedpsy.access_audit_events;DROP FUNCTION pedpsy.synthetic_lifecycle_audit_fail()");
  d=await x.studies.lifecycle(x.session.token,d.id,{status:"closed",expected_version:d.version});assert.deepEqual(await x.studies.lifecycle(x.session.token,d.id,{status:"closed",expected_version:d.version}),d);
  await assert.rejects(x.studies.lifecycle(x.session.token,d.id,{status:"closed",expected_version:d.version-1}),e=>e.code==="DESIGN_CONFLICT");
  assert.equal((await x.studies.lifecycle(x.session.token,other.id,{status:"active",expected_version:other.version})).status,"active");
});
scenario("attempt-bearing draft and closed designs reject every configuration route; helpers stay private",async(f,x)=>{
  await f.admin.query("INSERT INTO pedpsy.study_memberships(study_id,user_id,role) VALUES($1,$2,'researcher')",[f.studyId,x.row.user_id]);await f.admin.query("UPDATE pedpsy.studies SET status='draft' WHERE id=$1",[f.studyId]);
  const mutations=(d)=>[()=>x.studies.title(x.session.token,d.id,{title:"Denied",expected_version:d.version}),
    ()=>x.studies.group(x.session.token,d.id,undefined,{name:"Denied",kind:"other",expected_version:d.version}),
    ()=>x.studies.stage(x.session.token,d.id,undefined,{code:"Denied",ordinal:100,expected_version:d.version}),
    ()=>x.studies.assign(x.session.token,d.id,{group_id:d.groups[0].id,stage_id:d.stages[0].id,release_ids:[],expected_version:d.version}),
    ()=>x.studies.copy(x.session.token,d.id,{source_stage_id:d.stages[0].id,code:"Denied",ordinal:100,expected_version:d.version})];
  let d=await x.studies.read(x.session.token,f.studyId);for(const mutate of mutations(d))await assert.rejects(mutate,e=>e.code==="DESIGN_FROZEN");assert.deepEqual(await x.studies.read(x.session.token,d.id),d);
  d=await x.studies.lifecycle(x.session.token,d.id,{status:"closed",expected_version:d.version});for(const mutate of mutations(d))await assert.rejects(mutate,e=>e.code==="DESIGN_FROZEN");assert.deepEqual(await x.studies.read(x.session.token,d.id),d);
  for(const sql of ["SELECT pedpsy.constructor_snapshot_unbounded($1)","SELECT pedpsy.study_base_snapshot($1)","SELECT pedpsy.constructor_release_allowed($1)","SELECT pedpsy.require_mutable_design($1,0)","SELECT pedpsy.finish_study_design($1,'studies.groups')"])
    await assert.rejects(f.runtime.query(sql,[d.id]),e=>e.code==="42501");
});
