"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict"),{randomUUID}=require("node:crypto");
const {postgresFixture}=require("./postgres-fixture.js"),{verifiedStaff}=require("./mfa-fixture.js"),{studyResearcher}=require("./study-fixture.js");
const {PostgresPassportSchemas}=require("../dist/src/adapters/postgres/passport-schemas.js"),{tokenHash}=require("../dist/src/adapters/postgres/account-transaction.js");
const {migratePostgres,grantRuntime}=require("../dist/src/adapters/postgres/migrate.js"),{dockerTool}=require("./pg-container-fixture.js");
const fields=[{key:"extra_context",label:"Контекст",required:false,kind:"text",max_length:200},{key:"extra_years",label:"Стаж",required:false,kind:"integer",min:0,max:100},{key:"extra_setting",label:"Среда",required:false,kind:"single_choice",options:[{value:"school",label:"Школа"}]}];
const input=(p,additional_fields=fields)=>({expected_version:p.study_version,expected_schema_version:p.schema_version,basic_required:{city:p.fields[2].required},additional_fields});
function scenario(name,fn){test("PostgreSQL passport schema: "+name,async t=>{const f=await postgresFixture({runtimePoolSize:3});t.after(()=>f.close());const s=await verifiedStaff(f),x=await studyResearcher(f,s),d=await x.studies.create(x.session.token,"Synthetic passport schema"),schemas=new PostgresPassportSchemas(f.runtime);await fn(t,f,{...x,d,schemas,s});});}
async function wait(f,query){const until=Date.now()+2000;while(Date.now()<until){if((await f.admin.query("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=$1 AND wait_event_type='Lock' AND query LIKE $2) waiting",[f.database,"%"+query+"%"])).rows[0].waiting)return;await new Promise(r=>setTimeout(r,10));}assert.fail("schema operation never reached lock wait");}
scenario("existing and new studies have mandatory sex/age v1 and optional city; read metadata only",async(t,f,x)=>{
  const p=await x.schemas.read(x.session.token,x.d.id);assert.equal(p.schema_version,1);assert.equal(p.study_version,0);assert.equal(p.frozen,false);assert.deepEqual(p.fields.map(v=>[v.key,v.required]),[["sex",true],["age",true],["city",false]]);
  assert.deepEqual(Object.keys(p).sort(),["fields","frozen","schema_version","study_id","study_version"]);assert.equal((await f.admin.query("SELECT count(*) n FROM pedpsy.study_passport_schemas")).rows[0].n,(await f.admin.query("SELECT count(*) n FROM pedpsy.studies WHERE dataset_kind='demo'")).rows[0].n);
  const old=await x.schemas.read(x.s.session.token,f.studyId);assert.equal(old.schema_version,1);assert.equal(old.frozen,true);
});
scenario("all types saved as new immutable version; same-current replay audited without changing CAS",async(t,f,x)=>{
  const first=await x.schemas.read(x.session.token,x.d.id),p=await x.schemas.configure(x.session.token,x.d.id,input(first));assert.equal(p.schema_version,2);assert.equal(p.study_version,1);assert.deepEqual(p.fields.slice(3),fields);
  assert.deepEqual(await x.schemas.configure(x.session.token,x.d.id,input(p)),p);const removed=await x.schemas.configure(x.session.token,x.d.id,{...input(p,[]),basic_required:{city:true}});assert.equal(removed.schema_version,3);assert.equal(removed.fields.length,3);assert.equal(removed.fields[2].required,true);assert.ok(removed.fields.slice(0,2).every(v=>v.required));
  assert.equal((await f.admin.query("SELECT fields FROM pedpsy.passport_schema_versions WHERE study_id=$1 AND schema_version=2",[x.d.id])).rows[0].fields.length,6);
  await assert.rejects(f.admin.query("UPDATE pedpsy.passport_schema_versions SET fields='[]' WHERE study_id=$1",[x.d.id]),e=>e.code==="23514");
});
scenario("SQL repeats strict optional metadata whitelist and bounds; rejected writes leave no version",async(t,f,x)=>{
  const p=await x.schemas.read(x.session.token,x.d.id);
  for(const additional of [null,{},[{...fields[0],required:"true"}],[{...fields[0],key:"sex"}],[{...fields[0],key:"age"}],[{...fields[0],key:"email"}],[{...fields[0],score:1}],[{...fields[0],max_length:501}],[{...fields[1],min:101}],[{...fields[1],min:"0"}],[{...fields[2],options:[]}],[fields[0],fields[0]],Array.from({length:6},(_,i)=>({...fields[0],key:"extra_x"+i})),[{...fields[0],label:"a\n"}]])
    await assert.rejects(x.schemas.configure(x.session.token,x.d.id,input(p,additional)),e=>e.code==="INVALID_PASSPORT_SCHEMA");
  for(const basic_required of [null,[],{}, {city:false,sex:false},{city:false,age:false},{city:"false"}])await assert.rejects(x.schemas.configure(x.session.token,x.d.id,{...input(p),basic_required}),e=>e.code==="INVALID_PASSPORT_SCHEMA");
  assert.equal((await f.admin.query("SELECT count(*) n FROM pedpsy.passport_schema_versions WHERE study_id=$1",[x.d.id])).rows[0].n,"1");
});
scenario("same-study CAS race commits one new version; stale study/schema independently rejected",async(t,f,x)=>{
  const p=await x.schemas.read(x.session.token,x.d.id),results=await Promise.allSettled([x.session.token,x.s.session.token].map(v=>x.schemas.configure(v,x.d.id,input(p))));
  assert.equal(results.filter(v=>v.status==="fulfilled").length,1);assert.equal(results.find(v=>v.status==="rejected").reason.code,"DESIGN_CONFLICT");const current=await x.schemas.read(x.session.token,x.d.id);
  await assert.rejects(x.schemas.configure(x.session.token,x.d.id,{...input(current),expected_schema_version:1}),e=>e.code==="PASSPORT_SCHEMA_CONFLICT");
  assert.equal((await f.admin.query("SELECT count(*) n FROM pedpsy.passport_schema_versions WHERE study_id=$1",[x.d.id])).rows[0].n,"2");
});
scenario("active/closed/attempt-bearing designs cannot change even unused passport questions",async(t,f,x)=>{
  let d=x.d;
  d=await x.studies.assign(x.session.token,d.id,{group_id:d.groups[0].id,stage_id:d.stages[0].id,release_ids:[f.seed.release_id],expected_version:d.version});d=await x.studies.lifecycle(x.session.token,d.id,{status:"active",expected_version:d.version});
  let p=await x.schemas.read(x.session.token,d.id);assert.equal(p.frozen,true);await assert.rejects(x.schemas.configure(x.session.token,d.id,input(p)),e=>e.code==="DESIGN_FROZEN");
  d=await x.studies.lifecycle(x.session.token,d.id,{status:"closed",expected_version:d.version});p=await x.schemas.read(x.session.token,d.id);await assert.rejects(x.schemas.configure(x.s.session.token,d.id,input(p)),e=>e.code==="DESIGN_FROZEN");
  // Legacy seed membership has no real researcher credential. A staff write
  // must first have exactly one valid owner, then independently hit freeze.
  const before=(await f.admin.query("SELECT id,status,revision FROM pedpsy.attempts WHERE study_id=$1 ORDER BY id",[f.studyId])).rows;
  await f.admin.query("UPDATE pedpsy.study_memberships SET status='revoked' WHERE study_id=$1 AND role='researcher'",[f.studyId]);
  await f.admin.query("INSERT INTO pedpsy.study_memberships(study_id,user_id,role) VALUES($1,$2,'researcher')",[f.studyId,x.row.user_id]);
  await f.admin.query("UPDATE pedpsy.studies SET status='draft' WHERE id=$1",[f.studyId]);const legacy=await x.schemas.read(x.s.session.token,f.studyId);assert.equal(legacy.frozen,true);await assert.rejects(x.schemas.configure(x.s.session.token,f.studyId,input(legacy)),e=>e.code==="DESIGN_FROZEN");
  assert.deepEqual((await f.admin.query("SELECT id,status,revision FROM pedpsy.attempts WHERE study_id=$1 ORDER BY id",[f.studyId])).rows,before);
});
scenario("researcher scope and participant realm cannot grant metadata management",async(t,f,x)=>{
  const other=await studyResearcher(f,x.s);await assert.rejects(x.schemas.read(other.session.token,x.d.id),e=>e.status===404);await assert.rejects(x.schemas.configure(other.session.token,x.d.id,{expected_version:0,expected_schema_version:1,basic_required:{city:false},additional_fields:fields}),e=>e.status===404);
  await assert.rejects(x.schemas.read(f.raw,x.d.id),e=>e.status===401);await assert.rejects(x.schemas.read("",x.d.id),e=>e.status===401);
});
for(const role of ["administrator","superadministrator"])scenario(role+" manages questions globally as real staff, not individual passport values",async(t,f,x)=>{
  const s=role===x.s.role?x.s:await verifiedStaff(f,role),p=await x.schemas.read(s.session.token,x.d.id),saved=await x.schemas.configure(s.session.token,x.d.id,input(p));assert.equal(saved.schema_version,2);
  const audit=(await f.admin.query("SELECT credential_id,actor_role FROM pedpsy.access_audit_events WHERE study_id=$1 AND action='studies.passport_schema.configure'",[x.d.id])).rows;assert.deepEqual(audit,[{credential_id:s.id,actor_role:role}]);
  await f.admin.query("UPDATE pedpsy.staff_sessions SET created_at_ms=$2::bigint,mfa_verified_at=to_timestamp($2::bigint/1000.0) WHERE token_hash=$1",[tokenHash(s.session.token),Date.now()-360000]);
  await assert.rejects(x.schemas.configure(s.session.token,x.d.id,input(saved,[])),e=>e.code==="MFA_RECHECK_REQUIRED");assert.equal((await x.schemas.read(s.session.token,x.d.id)).schema_version,2);
});
scenario("mandatory metadata audit failure rolls back schema, pointer and study CAS",async(t,f,x)=>{
  const p=await x.schemas.read(x.session.token,x.d.id);await f.admin.query("CREATE FUNCTION pedpsy.synthetic_passport_audit_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action LIKE 'studies.passport_schema.%' THEN RAISE EXCEPTION 'synthetic audit failure';END IF;RETURN NEW;END $$;CREATE TRIGGER synthetic_passport_audit_fail BEFORE INSERT ON pedpsy.access_audit_events FOR EACH ROW EXECUTE FUNCTION pedpsy.synthetic_passport_audit_fail()");
  await assert.rejects(x.schemas.configure(x.session.token,x.d.id,input(p)),/synthetic audit failure/);await assert.rejects(x.schemas.read(x.session.token,x.d.id),/synthetic audit failure/);
  assert.equal((await f.admin.query("SELECT design_version FROM pedpsy.studies WHERE id=$1",[x.d.id])).rows[0].design_version,0);assert.equal((await f.admin.query("SELECT count(*) n FROM pedpsy.passport_schema_versions WHERE study_id=$1",[x.d.id])).rows[0].n,"1");
});
scenario("private tables/helpers, foreign key and immutable history default deny",async(t,f,x)=>{
  for(const sql of ["SELECT * FROM pedpsy.passport_schema_versions","SELECT * FROM pedpsy.study_passport_schemas","SELECT pedpsy.passport_basic_fields()","SELECT pedpsy.passport_schema_snapshot(gen_random_uuid())","SELECT pedpsy.passport_additional_valid('[]'::jsonb)"])
    await assert.rejects(f.runtime.query(sql),e=>e.code==="42501");
  await assert.rejects(f.admin.query("DELETE FROM pedpsy.passport_schema_versions WHERE study_id=$1",[x.d.id]),e=>e.code==="23514");await assert.rejects(f.admin.query("DELETE FROM pedpsy.study_passport_schemas WHERE study_id=$1",[x.d.id]),e=>e.code==="23514");
  await assert.rejects(f.admin.query("INSERT INTO pedpsy.passport_schema_versions(study_id,schema_version,fields) VALUES($1,1,pedpsy.passport_basic_fields())",[randomUUID()]),e=>e.code==="23503");
  assert.equal((await f.admin.query("SELECT count(*) n FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.pronamespace='pedpsy'::regnamespace AND a.grantee=0 AND a.privilege_type='EXECUTE'")).rows[0].n,"0");
});
scenario("staff revocation committed during lock wait prevents metadata write",async(t,f,x)=>{
  const p=await x.schemas.read(x.session.token,x.d.id),c=await f.admin.connect();let pending;
  try{await c.query("BEGIN");await c.query("SELECT id FROM pedpsy.staff_credentials WHERE id=$1 FOR UPDATE",[x.s.id]);pending=x.schemas.configure(x.s.session.token,x.d.id,input(p)).then(value=>({value}),error=>({error}));await wait(f,"configure_passport_schema");await c.query("UPDATE pedpsy.staff_credentials SET status='revoked',version=version+1 WHERE id=$1",[x.s.id]);await c.query("COMMIT");assert.equal((await pending).error?.status,401);
  }finally{await c.query("ROLLBACK");c.release();if(pending)await pending;}assert.equal((await x.schemas.read(x.session.token,x.d.id)).schema_version,1);
});
scenario("owner membership removal during study lock wait prevents staff metadata write",async(t,f,x)=>{
  const p=await x.schemas.read(x.session.token,x.d.id),c=await f.admin.connect();let pending;
  try{await c.query("BEGIN");await c.query("SELECT id FROM pedpsy.studies WHERE id=$1 FOR UPDATE",[x.d.id]);pending=x.schemas.configure(x.s.session.token,x.d.id,input(p)).then(value=>({value}),error=>({error}));await wait(f,"configure_passport_schema");await c.query("UPDATE pedpsy.study_memberships SET status='revoked' WHERE study_id=$1 AND user_id=$2",[x.d.id,x.row.user_id]);await c.query("COMMIT");assert.equal((await pending).error?.status,404);
  }finally{await c.query("ROLLBACK");c.release();if(pending)await pending;}assert.equal((await x.schemas.read(x.s.session.token,x.d.id)).schema_version,1);
});
test("PostgreSQL passport schema: append-only025 to026 upgrade backfills only metadata, old clinical IDs intact",async t=>{
  const fs=require("node:fs"),path=require("node:path"),os=require("node:os"),f=await postgresFixture({initialize:false,seedData:false}),source=path.join(__dirname,"../storage/postgres"),directory=fs.mkdtempSync(path.join(os.tmpdir(),"pedpsy-passport-upgrade-"));
  t.after(async()=>{await f.close();const target=path.resolve(directory);if(path.dirname(target)!==path.resolve(os.tmpdir())||!path.basename(target).startsWith("pedpsy-passport-upgrade-"))throw Error("UNSAFE_UPGRADE_FIXTURE_TARGET");fs.rmSync(target,{recursive:true});});
  for(const n of fs.readdirSync(source).filter(n=>/^\d{3}_[a-z0-9_]+\.sql$/.test(n)&&Number(n.slice(0,3))<=25))fs.copyFileSync(path.join(source,n),path.join(directory,n));
  const c=await f.admin.connect();try{assert.equal(await migratePostgres(c,directory),25);const study=randomUUID();await c.query("INSERT INTO pedpsy.studies(id,title,status) VALUES($1,'Synthetic upgrade','active')",[study]);const before=(await c.query("SELECT * FROM pedpsy.studies WHERE id=$1",[study])).rows[0];
    const latest=fs.readdirSync(source).filter(n=>/^\d{3}_[a-z0-9_]+\.sql$/.test(n)).length;assert.equal(await migratePostgres(c,source),latest-25);assert.equal(await migratePostgres(c,source),0);assert.deepEqual((await c.query("SELECT * FROM pedpsy.studies WHERE id=$1",[study])).rows[0],before);
    assert.equal((await c.query("SELECT schema_version FROM pedpsy.study_passport_schemas WHERE study_id=$1",[study])).rows[0].schema_version,1);await grantRuntime(c,f.runtimeRole);await assert.rejects(f.runtime.query("SELECT * FROM pedpsy.passport_schema_versions"),e=>e.code==="42501");
  }finally{c.release();}
});
scenario("nonempty version history survives full operational pg_dump/restore, private ACL retained",async(t,f,x)=>{
  const p=await x.schemas.read(x.session.token,x.d.id);await x.schemas.configure(x.session.token,x.d.id,input(p));const before=(await f.admin.query("SELECT * FROM pedpsy.passport_schema_versions ORDER BY study_id,schema_version")).rows;
  const archive=await dockerTool(["pg_dump","-U","postgres","-Fc","--no-owner","--no-acl","-d",f.database]),restored=await postgresFixture({initialize:false,seedData:false});t.after(()=>restored.close());
  try{await dockerTool(["pg_restore","-U","postgres","--no-owner","--no-acl","-d",restored.database],archive);const c=await restored.admin.connect();try{
    await c.query("REVOKE ALL ON SCHEMA pedpsy FROM PUBLIC;REVOKE CREATE ON SCHEMA public FROM PUBLIC;REVOKE ALL ON ALL TABLES IN SCHEMA pedpsy FROM PUBLIC;REVOKE ALL ON ALL FUNCTIONS IN SCHEMA pedpsy FROM PUBLIC;REVOKE ALL ON public.pedpsy_schema_migrations FROM PUBLIC");await grantRuntime(c,restored.runtimeRole);
    assert.equal(await migratePostgres(c,require("node:path").join(__dirname,"../storage/postgres")),0);assert.deepEqual((await c.query("SELECT * FROM pedpsy.passport_schema_versions ORDER BY study_id,schema_version")).rows,before);
    const schemas=new PostgresPassportSchemas(restored.runtime);assert.equal((await schemas.read(x.session.token,x.d.id)).schema_version,2);await assert.rejects(restored.runtime.query("SELECT * FROM pedpsy.study_passport_schemas"),e=>e.code==="42501");
  }finally{c.release();}}finally{archive.fill(0);}
});
