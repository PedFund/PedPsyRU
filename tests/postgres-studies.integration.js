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
