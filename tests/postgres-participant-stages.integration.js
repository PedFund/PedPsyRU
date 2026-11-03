"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict"),{randomBytes}=require("node:crypto");
const {postgresFixture}=require("./postgres-fixture.js"),{verifiedStaff}=require("./mfa-fixture.js"),{studyResearcher}=require("./study-fixture.js");
const {PostgresParticipantRegistration}=require("../dist/src/adapters/postgres/participant-registration.js"),{ContactTokenVault}=require("../dist/src/adapters/security/contact-token-vault.js");
const {PostgresGroupInvitations}=require("../dist/src/adapters/postgres/group-invitations.js"),{PostgresStageAccess}=require("../dist/src/adapters/postgres/stage-access.js");
const {PostgresParticipantStages}=require("../dist/src/adapters/postgres/participant-stages.js"),{PostgresParticipantPassports}=require("../dist/src/adapters/postgres/participant-passports.js");
const {PostgresParticipantConsents}=require("../dist/src/adapters/postgres/participant-consents.js"),{tokenHash}=require("../dist/src/adapters/postgres/account-transaction.js");
const {DOMAIN_TABLES}=require("../dist/src/adapters/postgres/snapshot.js");
async function configured(f){
 const staff=await verifiedStaff(f),r=await studyResearcher(f,staff);let design=await r.studies.create(r.session.token,"Synthetic stage discovery");
 for(const name of ["КГ","ЭГ"])design=await r.studies.group(r.session.token,design.id,undefined,{name,kind:"other",expected_version:design.version});
 design=await r.studies.stage(r.session.token,design.id,undefined,{code:"T1",ordinal:1,expected_version:design.version});
 for(const g of design.groups)for(const s of design.stages)design=await r.studies.assign(r.session.token,design.id,{group_id:g.id,stage_id:s.id,release_ids:[f.seed.release_id],expected_version:design.version});
 design=await r.studies.lifecycle(r.session.token,design.id,{status:"active",expected_version:design.version});
 const invitations=new PostgresGroupInvitations(f.runtime),invite=await invitations.create(r.session.token,design.id,design.groups[0].id,{expires_at:Date.now()+86400000});
 const vault=new ContactTokenVault(randomBytes(32)),registration=new PostgresParticipantRegistration(f.runtime,vault),browser=randomBytes(32).toString("base64url"),email="stage.discovery@example.test",password="synthetic discovery participant password";
 await registration.start(invite.invite_token,{email,password,contact_notice_version:"demo-contact-2",accept_contact_notice:true},browser);
 const out=(await f.admin.query("SELECT o.id,o.token_envelope FROM pedpsy.contact_confirmation_outbox o JOIN pedpsy.registration_pending p ON p.id=o.pending_id WHERE p.study_id=$1 AND p.browser_hash=$2 AND p.status='pending'",[design.id,tokenHash(browser)])).rows[0];
 await registration.confirm(invite.invite_token,{confirmation_token:vault.open(out.id,out.token_envelope)},browser);
 const session=await registration.login({study_id:design.id,email,password}),identity=(await f.admin.query("SELECT c.id credential_id,c.participant_id FROM pedpsy.participant_contacts p JOIN pedpsy.participant_credentials c ON (c.study_id,c.participant_id)=(p.study_id,p.participant_id) WHERE p.study_id=$1 AND p.email_key=$2",[design.id,email])).rows[0];
 return {r,staff,design,invitations,invite,registration,email,password,session,identity,stages:new PostgresParticipantStages(f.runtime),access:new PostgresStageAccess(f.runtime),passports:new PostgresParticipantPassports(f.runtime),consents:new PostgresParticipantConsents(f.runtime)};
}
const read=x=>x.stages.read(x.session.token);
const open=(x,group=0,stage=0)=>x.access.open(x.r.session.token,x.design.id,x.design.groups[group].id,x.design.stages[stage].id,{expected_revision:0});
async function domain(f){const result={};for(const table of DOMAIN_TABLES)result[table]=(await f.admin.query(`SELECT * FROM pedpsy.${table} ORDER BY 1,2`)).rows;return result;}
function scenario(name,fn){test("PostgreSQL own stages: "+name,async t=>{const f=await postgresFixture({runtimePoolSize:3});t.after(()=>f.close());const x=await configured(f);const before=await domain(f);await fn(t,f,x);assert.deepEqual(await domain(f),before,"discovery must never mutate clinical/design domain");});}
scenario("no manual opening means empty own list; readiness is separate and read creates no passport/consent/enrollment",async(t,f,x)=>{
 const a=await read(x);assert.deepEqual(Object.keys(a).sort(),["group_id","passport_completed","passport_schema_version","required_consents_accepted","stages","study_id"]);assert.equal(a.study_id,x.design.id);assert.equal(a.group_id,x.design.groups[0].id);assert.equal(a.passport_completed,false);assert.equal(a.required_consents_accepted,false);assert.deepEqual(a.stages,[]);
 for(const table of ["participant_passports","participant_consent_acceptances"])assert.equal((await f.admin.query(`SELECT count(*) n FROM pedpsy.${table} WHERE study_id=$1`,[x.design.id])).rows[0].n,"0");
 assert.deepEqual(await read(x),a);
});
scenario("opening another group stays invisible; only T1 can appear without fabricated T0",async(t,f,x)=>{
 await open(x,1,0);assert.deepEqual((await read(x)).stages,[]);await open(x,0,1);const a=await read(x);assert.equal(a.stages.length,1);assert.equal(a.stages[0].code,"T1");assert.equal(a.stages[0].stage_id,x.design.stages[1].id);assert.equal(a.stages[0].opening_revision,1);assert.equal(a.stages[0].assignment_ids.length,1);assert.deepEqual(Object.keys(a.stages[0]).sort(),["assignment_ids","code","opening_revision","ordinal","stage_id"]);
 assert.equal((await f.admin.query("SELECT count(*) n FROM pedpsy.stage_enrollments WHERE study_id=$1",[x.design.id])).rows[0].n,"0");
 await open(x,0,0);assert.deepEqual((await read(x)).stages.map(s=>s.code),["T0","T1"]);
});
scenario("completed current passport and explicit study consent set readiness; optional science not required",async(t,f,x)=>{
 await open(x);const draft=await x.passports.read(x.session.token),saved=await x.passports.save(x.session.token,{schema_version:draft.schema_version,expected_revision:draft.revision,values:{sex:"female",age:30}});
 await x.passports.complete(x.session.token,{schema_version:saved.schema_version,expected_revision:saved.revision});assert.equal((await read(x)).passport_completed,true);assert.equal((await read(x)).required_consents_accepted,false);
 await x.consents.accept(x.session.token,{purpose:"study_participation",document_version:"demo-participation-2",expected_policy_revision:0,accept:true});const a=await read(x);assert.equal(a.required_consents_accepted,true);assert.equal(a.passport_completed,true);assert.equal(a.stages.length,1);assert.equal((await x.consents.read(x.session.token)).documents.find(d=>d.purpose==="secondary_research").accepted_at_ms,null);
 const rotated=await x.registration.login({study_id:x.design.id,email:x.email,password:x.password});assert.deepEqual(await new PostgresParticipantStages(f.runtime).read(rotated.token),a);await assert.rejects(read(x),e=>e.status===401);
});
scenario("staff/researcher/legacy/forged scope cannot discover someone else's stages",async(t,f,x)=>{
 await open(x);for(const token of [x.staff.session.token,x.r.session.token,"A".repeat(43),""])await assert.rejects(x.stages.read(token),e=>e.status===401);await assert.rejects(x.stages.read(f.raw),e=>e.status===404);
 const own=await read(x);await f.withSession(async c=>{await c.query("SELECT set_config('app.role','superadministrator',true),set_config('app.participant_id',$1,true),set_config('app.group_id',$2,true)",[f.participant.id,x.design.groups[1].id]);assert.deepEqual((await c.query("SELECT pedpsy.read_own_stages() data")).rows[0].data,own);},tokenHash(x.session.token));
});
scenario("revoked recruitment does not remove existing identity; current contact/policy requirements still govern",async(t,f,x)=>{
 await open(x);const before=await read(x);await x.invitations.revoke(x.r.session.token,x.design.id,x.design.groups[0].id,x.invite.id,{expected_revision:x.invite.revision});assert.deepEqual(await read(x),before);
 await x.consents.accept(x.session.token,{purpose:"study_participation",document_version:"demo-participation-2",expected_policy_revision:0,accept:true});assert.equal((await read(x)).required_consents_accepted,true);
 await f.admin.query("INSERT INTO pedpsy.consent_documents(purpose,version,body_text) VALUES('study_participation','demo-stage-policy-2','Synthetic changed study policy')");
 await f.admin.query("UPDATE pedpsy.study_consent_policies SET participation_version='demo-stage-policy-2',revision=revision+1 WHERE study_id=$1",[x.design.id]);assert.equal((await read(x)).required_consents_accepted,false);
});
scenario("mandatory metadata audit failure rolls back last_seen and exposes no private values",async(t,f,x)=>{
 await read(x);const events=(await f.admin.query("SELECT * FROM pedpsy.access_audit_events WHERE action='participants.stages.read'")).rows;assert.equal(events.length,1);assert.equal(events[0].credential_id,x.identity.credential_id);assert.equal(events[0].resource_id,x.identity.participant_id);for(const value of [x.email,x.password,x.session.token,"demo-participation-2"])assert.ok(!JSON.stringify(events).includes(value));
 const sessions=(await f.admin.query("SELECT * FROM pedpsy.participant_sessions WHERE token_hash=$1",[tokenHash(x.session.token)])).rows;
 await f.admin.query("CREATE FUNCTION pedpsy.synthetic_stage_audit_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='participants.stages.read' THEN RAISE EXCEPTION 'synthetic stages audit failure';END IF;RETURN NEW;END $$;CREATE TRIGGER synthetic_stage_audit_fail BEFORE INSERT ON pedpsy.access_audit_events FOR EACH ROW EXECUTE FUNCTION pedpsy.synthetic_stage_audit_fail()");await assert.rejects(read(x),/synthetic stages audit failure/);assert.deepEqual((await f.admin.query("SELECT * FROM pedpsy.participant_sessions WHERE token_hash=$1",[tokenHash(x.session.token)])).rows,sessions);
});
scenario("wall-clock session expiry while stage lock waits returns no discovery",async(t,f,x)=>{
 const c=await f.admin.connect();let pending;try{await c.query("BEGIN");await c.query("SELECT 1 FROM pedpsy.research_stages WHERE study_id=$1 FOR UPDATE",[x.design.id]);await f.admin.query("UPDATE pedpsy.participant_sessions SET expires_at_ms=$2 WHERE token_hash=$1",[tokenHash(x.session.token),Date.now()+1000]);pending=read(x).then(value=>({value}),error=>({error}));for(let i=0;i<40;i++){const wait=(await f.admin.query("SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%read_own_stages%'"));if(wait.rowCount)break;await new Promise(r=>setTimeout(r,25));if(i===39)throw Error("synthetic stage lock wait missing");}await new Promise(r=>setTimeout(r,1100));await c.query("COMMIT");assert.equal((await pending).error?.status,401);}finally{await c.query("ROLLBACK");c.release();if(pending)await pending;}
});
scenario("private EXEC/PUBLIC boundary; discovery has no direct clinical mutation grant",async(t,f,x)=>{
 for(const sql of ["SELECT * FROM pedpsy.group_stage_access","SELECT * FROM pedpsy.participant_passports","SELECT * FROM pedpsy.participant_consent_acceptances","INSERT INTO pedpsy.stage_enrollments(id,study_id,participant_id,group_id,stage_id) VALUES(gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid())"])await assert.rejects(f.runtime.query(sql),e=>e.code==="42501");
 assert.equal((await f.admin.query("SELECT coalesce(bool_or(a.grantee=0 AND a.privilege_type='EXECUTE'),false) exposed FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE n.nspname='pedpsy' AND p.proname='read_own_stages'")).rows[0].exposed,false);
});
scenario("current closed stage/assignment or excluded enrollment never appears or reactivates",async(t,f,x)=>{
 await open(x);const stage=x.design.stages[0].id,group=x.design.groups[0].id;
 try{
   await f.admin.query("UPDATE pedpsy.research_stages SET status='closed' WHERE study_id=$1 AND id=$2",[x.design.id,stage]);assert.deepEqual((await read(x)).stages,[]);
   await f.admin.query("UPDATE pedpsy.research_stages SET status='active' WHERE study_id=$1 AND id=$2",[x.design.id,stage]);
   await f.admin.query("UPDATE pedpsy.assignments SET status='closed' WHERE study_id=$1 AND group_id=$2 AND stage_id=$3",[x.design.id,group,stage]);assert.deepEqual((await read(x)).stages,[]);
   await f.admin.query("UPDATE pedpsy.assignments SET status='active' WHERE study_id=$1 AND group_id=$2 AND stage_id=$3",[x.design.id,group,stage]);
   await f.admin.query("INSERT INTO pedpsy.stage_enrollments(id,study_id,participant_id,group_id,stage_id,status) VALUES(gen_random_uuid(),$1,$2,$3,$4,'excluded')",[x.design.id,x.identity.participant_id,group,stage]);
   const before=await domain(f);assert.deepEqual((await read(x)).stages,[]);assert.deepEqual(await domain(f),before);assert.equal((await f.admin.query("SELECT status FROM pedpsy.stage_enrollments WHERE study_id=$1 AND participant_id=$2",[x.design.id,x.identity.participant_id])).rows[0].status,"excluded");
 }finally{
   await f.admin.query("UPDATE pedpsy.research_stages SET status='active' WHERE study_id=$1 AND id=$2",[x.design.id,stage]);await f.admin.query("UPDATE pedpsy.assignments SET status='active' WHERE study_id=$1 AND group_id=$2 AND stage_id=$3",[x.design.id,group,stage]);await f.admin.query("DELETE FROM pedpsy.stage_enrollments WHERE study_id=$1 AND participant_id=$2",[x.design.id,x.identity.participant_id]);
 }
});
scenario("nonempty operational backup/restore retains own discovery and private runtime boundary",async(t,f,x)=>{
 const {dockerTool}=require("./pg-container-fixture.js"),{migratePostgres,grantRuntime}=require("../dist/src/adapters/postgres/migrate.js"),path=require("node:path");
 await open(x,0,1);const expected=await read(x),archive=await dockerTool(["pg_dump","-U","postgres","-Fc","--no-owner","--no-acl","-d",f.database]),restored=await postgresFixture({initialize:false,seedData:false});t.after(()=>restored.close());
 try{await dockerTool(["pg_restore","-U","postgres","--no-owner","--no-acl","-d",restored.database],archive);const c=await restored.admin.connect();try{await c.query("REVOKE ALL ON SCHEMA pedpsy FROM PUBLIC;REVOKE CREATE ON SCHEMA public FROM PUBLIC;REVOKE ALL ON ALL TABLES IN SCHEMA pedpsy FROM PUBLIC;REVOKE ALL ON ALL FUNCTIONS IN SCHEMA pedpsy FROM PUBLIC;REVOKE ALL ON public.pedpsy_schema_migrations FROM PUBLIC");await grantRuntime(c,restored.runtimeRole);assert.equal(await migratePostgres(c,path.join(__dirname,"../storage/postgres")),0);assert.deepEqual(await new PostgresParticipantStages(restored.runtime).read(x.session.token),expected);await assert.rejects(restored.runtime.query("SELECT * FROM pedpsy.group_stage_access"),e=>e.code==="42501");}finally{c.release();}}finally{archive.fill(0);}
});
test("PostgreSQL own stages: append-only028 to029 preserves legacy domain without fabricated passport/consent/group/enrollment",async t=>{
 const fs=require("node:fs"),path=require("node:path"),os=require("node:os"),{randomUUID}=require("node:crypto"),{migratePostgres,grantRuntime}=require("../dist/src/adapters/postgres/migrate.js");
 const f=await postgresFixture({initialize:false,seedData:false}),source=path.join(__dirname,"../storage/postgres"),directory=fs.mkdtempSync(path.join(os.tmpdir(),"pedpsy-own-stages-upgrade-"));
 t.after(async()=>{await f.close();const target=path.resolve(directory);if(path.dirname(target)!==path.resolve(os.tmpdir())||!path.basename(target).startsWith("pedpsy-own-stages-upgrade-"))throw Error("UNSAFE_UPGRADE_FIXTURE_TARGET");fs.rmSync(target,{recursive:true});});
 for(const name of fs.readdirSync(source).filter(n=>/^\d{3}_[a-z0-9_]+\.sql$/.test(n)&&Number(n.slice(0,3))<=28))fs.copyFileSync(path.join(source,name),path.join(directory,name));
 const c=await f.admin.connect();try{assert.equal(await migratePostgres(c,directory),28);const study=randomUUID(),participant=randomUUID();await c.query("INSERT INTO pedpsy.studies(id,title,status) VALUES($1,'Synthetic legacy discovery','active')",[study]);await c.query("INSERT INTO pedpsy.participants(id,study_id,display_code) VALUES($1,$2,'SYNTHETIC-LEGACY-DISCOVERY')",[participant,study]);const before=await domain(f);
   const latest=fs.readdirSync(source).filter(n=>/^\d{3}_[a-z0-9_]+\.sql$/.test(n)).length;assert.equal(await migratePostgres(c,source),latest-28);assert.equal(await migratePostgres(c,source),0);assert.deepEqual(await domain(f),before);
   for(const table of ["participant_group_bindings","participant_passports","participant_consent_acceptances","stage_enrollments","attempts"])assert.equal((await c.query(`SELECT count(*) n FROM pedpsy.${table}`)).rows[0].n,"0");await grantRuntime(c,f.runtimeRole);await assert.rejects(new PostgresParticipantStages(f.runtime).read("A".repeat(43)),e=>e.status===401);
 }finally{c.release();}
});
