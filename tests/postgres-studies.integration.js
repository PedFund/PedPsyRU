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
