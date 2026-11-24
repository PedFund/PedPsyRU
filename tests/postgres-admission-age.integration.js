"use strict";
// Migration 091: admission requires a confirmed adult age (18+) in the passport.
// The age is read from the same source that pins the attempt basis: the latest
// voluntary profile wave, otherwise the completed legacy passport.
const {test}=require("node:test"),assert=require("node:assert/strict");
const {postgresFixture}=require("./postgres-fixture.js"),{stageSetup}=require("./participant-enrollment-fixture.js");
const {PostgresResearchWorkbench,PostgresParticipantProfiles}=require("../dist/src/adapters/postgres/research-workbench.js");
async function counts(f,x){const result={};for(const table of ["stage_enrollments","stage_admissions","attempts"])result[table]=Number((await f.admin.query(`SELECT count(*) n FROM pedpsy.${table} WHERE study_id=$1`,[x.design.id])).rows[0].n);return result;}
async function acceptParticipation(x){const policy=await x.consents.read(x.session.token),doc=policy.documents.find(d=>d.purpose==="study_participation");await x.consents.accept(x.session.token,{purpose:"study_participation",document_version:doc.version,expected_policy_revision:policy.policy_revision,accept:true});}
async function openStage(x,stage=0){await x.access.open(x.r.session.token,x.design.id,x.design.groups[0].id,x.design.stages[stage].id,{expected_revision:0});}
function enrollWith(x,schemaVersion,policyRevision=0,stage=0){return x.enrollment.enroll(x.session.token,{stage_id:x.design.stages[stage].id,expected_opening_revision:1,expected_passport_schema_version:schemaVersion,expected_consent_policy_revision:policyRevision});}
function setup(fn){return async t=>{const f=await postgresFixture({runtimePoolSize:3});t.after(()=>f.close());await fn(f,await stageSetup(f));};}
test("PostgreSQL admission age: an adult legacy passport is admitted and pinned",setup(async(f,x)=>{
  const p=await x.passports.read(x.session.token);
  const saved=await x.passports.save(x.session.token,{schema_version:p.schema_version,expected_revision:p.revision,values:{sex:"female",age:18,education:"higher"}});
  await x.passports.complete(x.session.token,{schema_version:saved.schema_version,expected_revision:saved.revision});
  await acceptParticipation(x);await openStage(x);
  const admitted=await enrollWith(x,saved.schema_version);
  assert.equal(admitted.study_id,x.design.id);
  assert.equal(admitted.attempts.length,1);
  const basis=(await f.admin.query("SELECT answers FROM pedpsy.attempt_profile_basis WHERE study_id=$1",[x.design.id])).rows[0];
  assert.equal(basis.answers.age,18,"the pinned basis keeps the confirmed adult age");
}));
test("PostgreSQL admission age: a profile wave without the age field cannot admit",setup(async(f,x)=>{
  const current=Number((await f.admin.query("SELECT schema_version FROM pedpsy.study_passport_schemas WHERE study_id=$1",[x.design.id])).rows[0].schema_version);
  const store=new PostgresResearchWorkbench(f.runtime);
  await store.change(x.r.session.token,x.design.id,x.design.version,"schema",{all:true,group_id:null,schema_version:current,basic_fields:["sex","city"],fields:[]});
  const profiles=new PostgresParticipantProfiles(f.runtime),draft=await profiles.read(x.session.token);
  assert.deepEqual(draft.fields.map(field=>field.key).sort(),["city","sex"],"the configured wave has no age question");
  const saved=await profiles.change(x.session.token,"save",{schema_version:draft.schema_version,expected_revision:draft.revision,values:{sex:"female",city:"Синтетический город"}});
  await profiles.change(x.session.token,"complete",{schema_version:saved.schema_version,expected_revision:saved.revision});
  await acceptParticipation(x);await openStage(x);
  const before=await counts(f,x);
  await assert.rejects(enrollWith(x,current),error=>error.status===403&&error.code==="ADULT_PARTICIPANT_REQUIRED");
  assert.deepEqual(await counts(f,x),before,"a refused admission leaves no enrollment, admission or attempt");
}));
test("PostgreSQL admission age: a minor age is rejected before it can be stored",setup(async(f,x)=>{
  const p=await x.passports.read(x.session.token);
  await assert.rejects(x.passports.save(x.session.token,{schema_version:p.schema_version,expected_revision:p.revision,values:{sex:"female",age:17}}),error=>error.code==="INVALID_PASSPORT_VALUES");
  assert.equal(Number((await f.admin.query("SELECT count(*) n FROM pedpsy.participant_passports WHERE study_id=$1 AND answers->>'age'='17'",[x.design.id])).rows[0].n),0,"no minor passport row is stored");
}));
