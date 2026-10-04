"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict"),{randomBytes,randomUUID}=require("node:crypto");
const {postgresFixture}=require("./postgres-fixture.js"),{verifiedStaff}=require("./mfa-fixture.js"),{studyResearcher}=require("./study-fixture.js");
const {PostgresGroupInvitations}=require("../dist/src/adapters/postgres/group-invitations.js"),{PostgresPassportSchemas}=require("../dist/src/adapters/postgres/passport-schemas.js");
const {PostgresParticipantRegistration}=require("../dist/src/adapters/postgres/participant-registration.js"),{PostgresParticipantPassports}=require("../dist/src/adapters/postgres/participant-passports.js");
const {ContactTokenVault}=require("../dist/src/adapters/security/contact-token-vault.js"),{tokenHash}=require("../dist/src/adapters/postgres/account-transaction.js");
const {migratePostgres,grantRuntime}=require("../dist/src/adapters/postgres/migrate.js"),{dockerTool}=require("./pg-container-fixture.js");
const extra=[{key:"extra_context",label:"Контекст",kind:"text",required:true,max_length:40},{key:"extra_years",label:"Стаж",kind:"integer",required:false,min:-10,max:50},{key:"extra_setting",label:"Среда",kind:"single_choice",required:false,options:[{value:"school",label:"Школа"}]}];
const full={sex:"female",age:42,city:"Synthetic town",extra_context:"Synthetic context"};
async function identity(f,x,email="own@example.test"){
  const browser=randomBytes(32).toString("base64url"),password="synthetic passport password",body={email,password,contact_notice_version:"demo-contact-1",accept_contact_notice:true};
  await x.registration.start(x.i.invite_token,body,browser);
  const outbox=(await f.admin.query("SELECT o.id,o.token_envelope FROM pedpsy.contact_confirmation_outbox o JOIN pedpsy.registration_pending p ON p.id=o.pending_id WHERE p.study_id=$1 AND p.browser_hash=$2 AND p.status='pending'",[x.design.id,tokenHash(browser)])).rows[0];
  await x.registration.confirm(x.i.invite_token,{confirmation_token:x.vault.open(outbox.id,outbox.token_envelope)},browser);
  const ownSession=await x.registration.login({study_id:x.design.id,email,password});
  const own=(await f.admin.query("SELECT c.participant_id,c.id contact_id,k.id credential_id FROM pedpsy.participant_contacts c JOIN pedpsy.participant_credentials k ON (k.study_id,k.participant_id)=(c.study_id,c.participant_id) WHERE c.study_id=$1 AND c.email_key=$2",[x.design.id,email])).rows[0];
  return {ownSession,own,email,password};
}
async function configured(f){
  const s=await verifiedStaff(f),x=await studyResearcher(f,s),schemas=new PostgresPassportSchemas(f.runtime);let d=await x.studies.create(x.session.token,"Synthetic own passport");
  const p=await schemas.read(x.session.token,d.id);await schemas.configure(x.session.token,d.id,{expected_version:p.study_version,expected_schema_version:p.schema_version,basic_required:{city:true},additional_fields:extra});
  d=await x.studies.read(x.session.token,d.id);d=await x.studies.group(x.session.token,d.id,undefined,{name:"КГ",kind:"control",expected_version:d.version});d=await x.studies.stage(x.session.token,d.id,undefined,{code:"T0",ordinal:0,expected_version:d.version});
  d=await x.studies.assign(x.session.token,d.id,{group_id:d.groups[0].id,stage_id:d.stages[0].id,release_ids:[f.seed.release_id],expected_version:d.version});d=await x.studies.lifecycle(x.session.token,d.id,{status:"active",expected_version:d.version});
  const invitations=new PostgresGroupInvitations(f.runtime),i=await invitations.create(x.session.token,d.id,d.groups[0].id,{expires_at:Date.now()+86400000}),vault=new ContactTokenVault(randomBytes(32)),registration=new PostgresParticipantRegistration(f.runtime,vault),base={...x,s,design:d,invitations,i,vault,registration,passports:new PostgresParticipantPassports(f.runtime)};
  return {...base,...await identity(f,base)};
}
function scenario(name,fn){test("PostgreSQL own passport: "+name,async t=>{const f=await postgresFixture({runtimePoolSize:3});t.after(()=>f.close());await fn(t,f,await configured(f));});}
const save=(x,values,expected_revision=0,schema_version=2)=>x.passports.save(x.ownSession.token,{schema_version,expected_revision,values});
const complete=(x,expected_revision,schema_version=2)=>x.passports.complete(x.ownSession.token,{schema_version,expected_revision});
const noClinical=async(f,x)=>assert.equal((await f.admin.query("SELECT (SELECT count(*) FROM pedpsy.stage_enrollments WHERE study_id=$1)+(SELECT count(*) FROM pedpsy.attempts WHERE study_id=$1) n",[x.design.id])).rows[0].n,"0");
async function wait(f){const end=Date.now()+2000;while(Date.now()<end){if((await f.admin.query("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=$1 AND wait_event_type='Lock' AND query LIKE '%save_own_passport%') waiting",[f.database])).rows[0].waiting)return;await new Promise(r=>setTimeout(r,10));}assert.fail("own passport did not reach lock wait");}
scenario("read is own metadata/not_started revision0 without inserting identity/profile/clinical rows",async(t,f,x)=>{
  const p=await x.passports.read(x.ownSession.token);assert.deepEqual(Object.keys(p).sort(),["fields","revision","schema_version","status","study_id","values"]);assert.equal(p.study_id,x.design.id);assert.equal(p.schema_version,2);assert.equal(p.revision,0);assert.equal(p.status,"not_started");assert.deepEqual(p.values,{});
  assert.equal((await f.admin.query("SELECT count(*) n FROM pedpsy.participant_passports")).rows[0].n,"0");await noClinical(f,x);
});
scenario("partial snapshot saved/restored with pinned fields/CAS; clearing omits values, never imputes zero",async(t,f,x)=>{
  const first=await save(x,{city:"Town",extra_years:0});assert.equal(first.revision,1);assert.equal(first.status,"draft");assert.deepEqual(first.values,{city:"Town",extra_years:0});
  assert.deepEqual(await new PostgresParticipantPassports(f.runtime).read(x.ownSession.token),first);
  const same=await save(x,first.values,1);assert.equal(same.revision,1);const cleared=await save(x,{},1);assert.equal(cleared.revision,2);assert.deepEqual(cleared.values,{});
  const session=await x.registration.login({study_id:x.design.id,email:x.email,password:x.password});assert.deepEqual(await x.passports.read(session.token),cleared);await assert.rejects(x.passports.read(x.ownSession.token),e=>e.status===401);await noClinical(f,x);
});
scenario("mandatory sex/age/city/custom are checked only on explicit saved-value completion",async(t,f,x)=>{
  await assert.rejects(complete(x,0),e=>e.code==="PASSPORT_INCOMPLETE");let revision=0;
  for(const values of [{},{sex:"female"},{sex:"female",age:42},{sex:"female",age:42,city:"Town"}]){const p=await save(x,values,revision);revision=p.revision;await assert.rejects(complete(x,revision),e=>e.code==="PASSPORT_INCOMPLETE");}
  const saved=await save(x,full,revision),done=await complete(x,saved.revision);assert.equal(done.status,"completed");assert.equal(done.revision,saved.revision+1);assert.deepEqual(done.values,full);assert.ok(!Object.hasOwn(done.values,"extra_years"));await noClinical(f,x);
});
scenario("SQL repeats exact field/type/range/choice/Unicode/blank limits, rejected draft never persists",async(t,f,x)=>{
  for(const values of [null,[],"text",{age:null},{age:"42"},{age:42.5},{age:-1},{age:131},{sex:"Женский"},{sex:"other"},{city:" "},{city:"\u00a0\u2003\ufeff"},{city:" Town "},{city:"a\n"},{city:"🙂".repeat(101)},{extra_context:"x".repeat(41)},{extra_setting:"other"},{extra_years:51},{extra_unknown:"x"},{role:"participant"},{participant_id:x.own.participant_id},{city:{text:"x"}}])await assert.rejects(save(x,values),e=>e.code==="INVALID_PASSPORT_VALUES");
  assert.equal((await f.admin.query("SELECT count(*) n FROM pedpsy.participant_passports")).rows[0].n,"0");assert.equal((await save(x,{city:"🙂".repeat(100),age:0,extra_years:-10})).revision,1);
});
scenario("two tabs CAS commits one snapshot; stale schema/revision cannot overwrite even same values",async(t,f,x)=>{
  const results=await Promise.allSettled([save(x,{city:"A"}),save(x,{city:"B"})]);assert.equal(results.filter(r=>r.status==="fulfilled").length,1);assert.equal(results.find(r=>r.status==="rejected").reason.code,"PASSPORT_CONFLICT");
  const p=await x.passports.read(x.ownSession.token);await assert.rejects(save(x,p.values,0),e=>e.code==="PASSPORT_CONFLICT");await assert.rejects(save(x,full,1,1),e=>e.code==="PARTICIPATION_REQUIREMENTS_CHANGED");assert.deepEqual(await x.passports.read(x.ownSession.token),p);
});
scenario("completion concurrent/lost-response replay is immutable/idempotent, old drafts cannot resume",async(t,f,x)=>{
  const p=await save(x,full),results=await Promise.all([complete(x,p.revision),complete(x,p.revision)]);assert.deepEqual(results[0],results[1]);assert.equal(results[0].revision,2);assert.deepEqual(await complete(x,2),results[0]);await assert.rejects(complete(x,0),e=>e.code==="PASSPORT_CONFLICT");await assert.rejects(save(x,full,2),e=>e.code==="PASSPORT_FROZEN");
  assert.equal((await f.admin.query("SELECT count(*) n FROM pedpsy.participant_passports WHERE study_id=$1",[x.design.id])).rows[0].n,"1");await noClinical(f,x);
});
scenario("another participant gets only own data; forged GUCs, researcher/staff/legacy/expired realms cannot impersonate",async(t,f,x)=>{
  await save(x,full);const other=await identity(f,x,"another@example.test");assert.equal((await x.passports.read(other.ownSession.token)).status,"not_started");
  const own=await f.withSession(async c=>{await c.query("SELECT set_config('app.study_id',$1,true),set_config('app.participant_id',$2,true),set_config('app.role','superadministrator',true)",[f.studyId,f.participant.id]);return (await c.query("SELECT pedpsy.read_own_passport() data")).rows[0].data;},tokenHash(x.ownSession.token));assert.deepEqual(own.values,full);assert.equal(own.study_id,x.design.id);
  for(const token of [x.session.token,x.s.session.token,"A".repeat(43),""])await assert.rejects(x.passports.read(token),e=>e.status===401);await assert.rejects(x.passports.read(f.raw),e=>e.status===404);assert.equal((await x.passports.read(other.ownSession.token)).revision,0);
});
scenario("private table/helpers/public ACL/scoped FK and pinned/completed immutability",async(t,f,x)=>{
  for(const sql of ["SELECT * FROM pedpsy.participant_passports","DELETE FROM pedpsy.participant_passports","SELECT pedpsy.passport_values_valid('[]','{}',false)","SELECT pedpsy.lock_own_passport_scope()","SELECT pedpsy.own_passport_snapshot(gen_random_uuid(),gen_random_uuid(),1,'[]')","SELECT pedpsy.assert_own_passport_session()"])
    await assert.rejects(f.runtime.query(sql),e=>e.code==="42501");
  await assert.rejects(f.admin.query("INSERT INTO pedpsy.participant_passports(study_id,participant_id,schema_version,revision,answers,created_at_ms,updated_at_ms) VALUES($1,$2,999,1,'{}',0,0)",[x.design.id,x.own.participant_id]),e=>e.code==="23503");
  await assert.rejects(f.admin.query("INSERT INTO pedpsy.participant_passports(study_id,participant_id,schema_version,revision,answers,created_at_ms,updated_at_ms) VALUES($1,$2,2,1,'{}',0,0)",[x.design.id,f.participant.id]),e=>e.code==="23503");
  await save(x,full);await assert.rejects(f.admin.query("UPDATE pedpsy.participant_passports SET schema_version=1,revision=revision+1 WHERE study_id=$1",[x.design.id]),e=>e.code==="23514");await complete(x,1);
  for(const sql of ["UPDATE pedpsy.participant_passports SET answers='{}',revision=revision+1 WHERE study_id=$1","DELETE FROM pedpsy.participant_passports WHERE study_id=$1"])await assert.rejects(f.admin.query(sql,[x.design.id]),e=>e.code==="23514");
  assert.equal((await f.admin.query("SELECT count(*) n FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.pronamespace='pedpsy'::regnamespace AND a.grantee=0 AND a.privilege_type='EXECUTE'")).rows[0].n,"0");
});
scenario("mandatory value-free audit failure rolls back save and completion, including session touch",async(t,f,x)=>{
  await save(x,full);const before=(await f.admin.query("SELECT * FROM pedpsy.participant_passports WHERE study_id=$1",[x.design.id])).rows[0],seen=(await f.admin.query("SELECT last_seen_at_ms FROM pedpsy.participant_sessions WHERE token_hash=$1",[tokenHash(x.ownSession.token)])).rows[0];
  await f.admin.query("CREATE FUNCTION pedpsy.synthetic_own_passport_audit_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action LIKE 'participants.passport.%' THEN RAISE EXCEPTION 'synthetic own passport audit failure';END IF;RETURN NEW;END $$;CREATE TRIGGER synthetic_own_passport_audit_fail BEFORE INSERT ON pedpsy.access_audit_events FOR EACH ROW EXECUTE FUNCTION pedpsy.synthetic_own_passport_audit_fail()");
  await assert.rejects(save(x,{...full,age:43},1),/synthetic own passport audit failure/);await assert.rejects(complete(x,1),/synthetic own passport audit failure/);await assert.rejects(x.passports.read(x.ownSession.token),/synthetic own passport audit failure/);
  assert.deepEqual((await f.admin.query("SELECT * FROM pedpsy.participant_passports WHERE study_id=$1",[x.design.id])).rows[0],before);assert.deepEqual((await f.admin.query("SELECT last_seen_at_ms FROM pedpsy.participant_sessions WHERE token_hash=$1",[tokenHash(x.ownSession.token)])).rows[0],seen);
  const audit=(await f.admin.query("SELECT * FROM pedpsy.access_audit_events WHERE study_id=$1 AND action LIKE 'participants.passport.%'",[x.design.id])).rows;assert.equal(audit.length,1);assert.equal(audit[0].credential_id,x.own.credential_id);assert.equal(audit[0].resource_id,x.own.participant_id);assert.equal(audit[0].record_count,4);
  for(const v of [x.email,x.password,x.ownSession.token,...Object.values(full).filter(v=>typeof v==="string")])assert.ok(!JSON.stringify(audit).includes(v));
});
scenario("recruitment revocation preserves accepted own passport access, changed notice blocks it",async(t,f,x)=>{
  await x.invitations.revoke(x.session.token,x.design.id,x.design.groups[0].id,x.i.id,{expected_revision:0});await save(x,full);await complete(x,1);assert.equal((await x.passports.read(x.ownSession.token)).status,"completed");
  await f.admin.query("INSERT INTO pedpsy.contact_notices VALUES('demo-contact-2','Synthetic changed contact notice','synthetic_only')");await f.admin.query("UPDATE pedpsy.study_contact_policies SET notice_version='demo-contact-2' WHERE study_id=$1",[x.design.id]);await assert.rejects(x.passports.read(x.ownSession.token),e=>e.code==="PARTICIPATION_REQUIREMENTS_CHANGED");await noClinical(f,x);
});
for(const kind of ["credential","group","contact","study"])scenario(kind+" change committed during row lock wait blocks current write",async(t,f,x)=>{
  const c=await f.admin.connect();let pending;const target=kind==="credential"?["participant_credentials","id",x.own.credential_id]:kind==="group"?["research_groups","id",x.design.groups[0].id]:kind==="contact"?["participant_contacts","id",x.own.contact_id]:["studies","id",x.design.id];
  try{await c.query("BEGIN");await c.query(`SELECT id FROM pedpsy.${target[0]} WHERE ${target[1]}=$1 FOR UPDATE`,[target[2]]);pending=save(x,full).then(value=>({value}),error=>({error}));await wait(f);
    const mutation=kind==="credential"?"status='revoked',version=version+1":kind==="contact"?"status='withdrawn'":"status='closed'";await c.query(`UPDATE pedpsy.${target[0]} SET ${mutation} WHERE ${target[1]}=$1`,[target[2]]);await c.query("COMMIT");assert.equal((await pending).error?.status,["credential","study"].includes(kind)?401:404);
  }finally{await c.query("ROLLBACK");c.release();if(pending)await pending;}assert.equal((await f.admin.query("SELECT count(*) n FROM pedpsy.participant_passports")).rows[0].n,"0");
});
scenario("wall-clock expiry while waiting on profile defeats statement-time stale authority",async(t,f,x)=>{
  await save(x,full);const c=await f.admin.connect();let pending;
  try{await c.query("BEGIN");await c.query("SELECT participant_id FROM pedpsy.participant_passports WHERE study_id=$1 FOR UPDATE",[x.design.id]);await f.admin.query("UPDATE pedpsy.participant_sessions SET created_at_ms=$2::bigint,last_seen_at_ms=$2::bigint,expires_at_ms=$3::bigint WHERE token_hash=$1",[tokenHash(x.ownSession.token),Date.now()-1000,Date.now()+700]);
    pending=save(x,{...full,age:43},1).then(value=>({value}),error=>({error}));await wait(f);await new Promise(r=>setTimeout(r,850));await c.query("COMMIT");assert.equal((await pending).error?.status,401);
  }finally{await c.query("ROLLBACK");c.release();if(pending)await pending;}assert.equal((await f.admin.query("SELECT revision,answers FROM pedpsy.participant_passports WHERE study_id=$1",[x.design.id])).rows[0].revision,1);
});
scenario("contact notice changed during policy lock wait denies stale acknowledgement without a profile",async(t,f,x)=>{
  const c=await f.admin.connect();let pending;
  try{await c.query("BEGIN");await c.query("SELECT study_id FROM pedpsy.study_contact_policies WHERE study_id=$1 FOR UPDATE",[x.design.id]);pending=save(x,full).then(value=>({value}),error=>({error}));await wait(f);
    await c.query("INSERT INTO pedpsy.contact_notices VALUES('demo-contact-2','Synthetic policy race','synthetic_only')");await c.query("UPDATE pedpsy.study_contact_policies SET notice_version='demo-contact-2' WHERE study_id=$1",[x.design.id]);await c.query("COMMIT");assert.equal((await pending).error?.code,"PARTICIPATION_REQUIREMENTS_CHANGED");
  }finally{await c.query("ROLLBACK");c.release();if(pending)await pending;}assert.equal((await f.admin.query("SELECT count(*) n FROM pedpsy.participant_passports")).rows[0].n,"0");
});
scenario("nonempty completed passport full operational backup/restore retains exact data, scope and ACL",async(t,f,x)=>{
  await save(x,full);const done=await complete(x,1),before=(await f.admin.query("SELECT * FROM pedpsy.participant_passports ORDER BY study_id,participant_id")).rows;
  const archive=await dockerTool(["pg_dump","-U","postgres","-Fc","--no-owner","--no-acl","-d",f.database]),restored=await postgresFixture({initialize:false,seedData:false});t.after(()=>restored.close());
  try{await dockerTool(["pg_restore","-U","postgres","--no-owner","--no-acl","-d",restored.database],archive);const c=await restored.admin.connect();try{
    await c.query("REVOKE ALL ON SCHEMA pedpsy FROM PUBLIC;REVOKE CREATE ON SCHEMA public FROM PUBLIC;REVOKE ALL ON ALL TABLES IN SCHEMA pedpsy FROM PUBLIC;REVOKE ALL ON ALL FUNCTIONS IN SCHEMA pedpsy FROM PUBLIC;REVOKE ALL ON public.pedpsy_schema_migrations FROM PUBLIC");await grantRuntime(c,restored.runtimeRole);assert.equal(await migratePostgres(c,require("node:path").join(__dirname,"../storage/postgres")),0);
    assert.deepEqual((await c.query("SELECT * FROM pedpsy.participant_passports ORDER BY study_id,participant_id")).rows,before);assert.deepEqual(await new PostgresParticipantPassports(restored.runtime).read(x.ownSession.token),done);await assert.rejects(restored.runtime.query("SELECT * FROM pedpsy.participant_passports"),e=>e.code==="42501");await assert.rejects(restored.runtime.query("SELECT pedpsy.assert_own_passport_session()"),e=>e.code==="42501");
  }finally{c.release();}}finally{archive.fill(0);}
});
test("PostgreSQL own passport: append-only026 to027 leaves legacy study/schema/identity unchanged and no automatic profiles",async t=>{
  const fs=require("node:fs"),path=require("node:path"),os=require("node:os"),f=await postgresFixture({initialize:false,seedData:false}),source=path.join(__dirname,"../storage/postgres"),directory=fs.mkdtempSync(path.join(os.tmpdir(),"pedpsy-own-passport-upgrade-"));
  t.after(async()=>{await f.close();const target=path.resolve(directory);if(path.dirname(target)!==path.resolve(os.tmpdir())||!path.basename(target).startsWith("pedpsy-own-passport-upgrade-"))throw Error("UNSAFE_UPGRADE_FIXTURE_TARGET");fs.rmSync(target,{recursive:true});});
  for(const name of fs.readdirSync(source).filter(n=>/^\d{3}_[a-z0-9_]+\.sql$/.test(n)&&Number(n.slice(0,3))<=26))fs.copyFileSync(path.join(source,name),path.join(directory,name));
  const c=await f.admin.connect();try{assert.equal(await migratePostgres(c,directory),26);const study=randomUUID(),participant=randomUUID();await c.query("INSERT INTO pedpsy.studies(id,title,status) VALUES($1,'Synthetic legacy passport upgrade','active')",[study]);await c.query("INSERT INTO pedpsy.participants(id,study_id,display_code) VALUES($1,$2,'SYNTHETIC-LEGACY-PASSPORT')",[participant,study]);
    const before=(await c.query("SELECT * FROM pedpsy.studies WHERE id=$1",[study])).rows[0],identity=(await c.query("SELECT * FROM pedpsy.participants WHERE id=$1",[participant])).rows[0],schemas=(await c.query("SELECT * FROM pedpsy.passport_schema_versions WHERE study_id=$1 ORDER BY schema_version",[study])).rows;
    const latest=fs.readdirSync(source).filter(n=>/^\d{3}_[a-z0-9_]+\.sql$/.test(n)).length;assert.equal(await migratePostgres(c,source),latest-26);assert.equal(await migratePostgres(c,source),0);assert.deepEqual((await c.query("SELECT * FROM pedpsy.studies WHERE id=$1",[study])).rows[0],before);assert.deepEqual((await c.query("SELECT * FROM pedpsy.participants WHERE id=$1",[participant])).rows[0],identity);assert.deepEqual((await c.query("SELECT * FROM pedpsy.passport_schema_versions WHERE study_id=$1 ORDER BY schema_version",[study])).rows,schemas);
    assert.equal((await c.query("SELECT count(*) n FROM pedpsy.participant_passports")).rows[0].n,"0");await grantRuntime(c,f.runtimeRole);await assert.rejects(f.runtime.query("SELECT * FROM pedpsy.participant_passports"),e=>e.code==="42501");
  }finally{c.release();}
});
