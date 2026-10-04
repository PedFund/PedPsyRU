"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict"),{randomBytes}=require("node:crypto");
const {postgresFixture}=require("./postgres-fixture.js"),{verifiedStaff}=require("./mfa-fixture.js"),{invitationResearcher}=require("./group-invitation-fixture.js");
const {PostgresRegistrationStart}=require("../dist/src/adapters/postgres/registration-start.js"),{ContactTokenVault}=require("../dist/src/adapters/security/contact-token-vault.js");
const {tokenHash}=require("../dist/src/adapters/postgres/account-transaction.js"),{derive,SCRYPT,equalText}=require("../storage/access.js");
const body={email:"Demo.Owner+tag@EXAMPLE.test",password:"synthetic contact password",contact_notice_version:"demo-contact-1",accept_contact_notice:true};
const token=()=>randomBytes(32).toString("base64url");
async function configured(f){const s=await verifiedStaff(f),x=await invitationResearcher(f,s),i=await x.invitations.create(x.session.token,x.design.id,x.design.groups[0].id,{expires_at:Date.now()+86400000}),vault=new ContactTokenVault(randomBytes(32));return {...x,s,i,vault,registration:new PostgresRegistrationStart(f.runtime,vault),browser:token()};}
function scenario(name,fn){test("PostgreSQL pending registration: "+name,async t=>{const f=await postgresFixture({runtimePoolSize:2});t.after(()=>f.close());await fn(f,await configured(f));});}
const counts=async(f,study)=>(await f.admin.query("SELECT (SELECT count(*)::integer FROM pedpsy.registration_pending WHERE study_id=$1) pending,(SELECT count(*)::integer FROM pedpsy.contact_confirmation_outbox) outbox,(SELECT count(*)::integer FROM pedpsy.participants WHERE study_id=$1) participants,(SELECT count(*)::integer FROM pedpsy.stage_enrollments WHERE study_id=$1) enrollments,(SELECT count(*)::integer FROM pedpsy.attempts WHERE study_id=$1) attempts",[study])).rows[0];
scenario("landing is notice metadata only; no opening or enrollment/session/contact proof on GET",async(f,x)=>{
  const before=await counts(f,x.design.id),a=await x.registration.landing(x.i.invite_token),b=await x.registration.landing(x.i.invite_token);
  assert.deepEqual(a,b);assert.deepEqual(Object.keys(a).sort(),["contact_notice","group_name","study_title"]);assert.equal(a.contact_notice.version,"demo-contact-1");assert.equal(a.contact_notice.legal_status,"synthetic_only");assert.ok(a.contact_notice.text.includes("вымышленные"));
  assert.deepEqual(await counts(f,x.design.id),before);assert.equal((await f.admin.query("SELECT count(*)::integer n FROM pedpsy.group_stage_access")).rows[0].n,0);
  assert.equal((await f.admin.query("SELECT count(*)::integer n FROM pedpsy.access_audit_events WHERE study_id=$1 AND action='participants.registration.landing'",[x.design.id])).rows[0].n,2);
});
scenario("salted scrypt and encrypted durable purpose-bound outbox committed together; raw secrets never returned/audited/stored",async(f,x)=>{
  const result=await x.registration.start(x.i.invite_token,body,x.browser);assert.deepEqual(result,{status:"confirmation_requested"});
  const p=(await f.admin.query("SELECT * FROM pedpsy.registration_pending WHERE study_id=$1",[x.design.id])).rows[0],o=(await f.admin.query("SELECT * FROM pedpsy.contact_confirmation_outbox WHERE pending_id=$1",[p.id])).rows[0];
  assert.equal(p.status,"pending");assert.equal(p.email_key,"Demo.Owner+tag@example.test");assert.equal(p.browser_hash,tokenHash(x.browser));assert.equal(p.group_id,x.design.groups[0].id);assert.equal(p.invitation_revision,0);assert.equal(p.attempts_remaining,5);
  const hash=await derive(body.password,Buffer.from(p.salt,"hex"),64,SCRYPT);try{assert.ok(equalText(hash.toString("hex"),p.password_hash));}finally{hash.fill(0);}
  const confirmation=x.vault.open(o.id,o.token_envelope);assert.ok(tokenHash(confirmation)===p.confirmation_hash);assert.ok(confirmation!==x.i.invite_token&&confirmation!==x.browser);assert.equal(o.purpose,"email_confirmation");assert.equal(o.status,"ready");assert.equal(o.recipient,p.email_key);assert.equal(Number(o.expires_at_ms)-Number(o.created_at_ms),1800000);
  const audit=(await f.admin.query("SELECT * FROM pedpsy.access_audit_events WHERE study_id=$1",[x.design.id])).rows;
  for(const value of [body.password,x.browser,x.i.invite_token,confirmation,p.email_key])assert.ok(!JSON.stringify(audit).includes(value),"sensitive value in audit");
  assert.ok(!JSON.stringify([p,o]).includes(body.password));assert.ok(!JSON.stringify([p,o]).includes(confirmation));
  assert.deepEqual(await counts(f,x.design.id),{pending:1,outbox:1,participants:0,enrollments:0,attempts:0});
});
scenario("repeat request neutral, rotates only same browser/email; other browser does not replace participant/password",async(f,x)=>{
  const first=await x.registration.start(x.i.invite_token,body,x.browser),second=await x.registration.start(x.i.invite_token,body,x.browser);
  assert.deepEqual(first,second);assert.deepEqual((await f.admin.query("SELECT status,count(*)::integer n FROM pedpsy.registration_pending WHERE study_id=$1 GROUP BY status ORDER BY status",[x.design.id])).rows,[{status:"cancelled",n:1},{status:"pending",n:1}]);
  assert.deepEqual((await f.admin.query("SELECT status,count(*)::integer n FROM pedpsy.contact_confirmation_outbox GROUP BY status ORDER BY status")).rows,[{status:"cancelled",n:1},{status:"ready",n:1}]);
  assert.deepEqual(await new PostgresRegistrationStart(f.runtime,x.vault).start(x.i.invite_token,{...body,password:"different synthetic password"},token()),first);
  assert.equal((await counts(f,x.design.id)).participants,0);assert.equal((await f.admin.query("SELECT count(*)::integer n FROM pedpsy.registration_pending WHERE study_id=$1 AND status='pending'",[x.design.id])).rows[0].n,2);
});
scenario("unknown/revoked/closed invitation and changed notice denied; invalid contact/body cannot leak or assign scope",async(f,x)=>{
  for(const input of [{...body,email:"owner@real.invalid"},{...body,email:"@@example.test"},{...body,role:"administrator"},{...body,group_id:x.design.groups[1].id},{...body,accept_contact_notice:false},{...body,password:"short"}])await assert.rejects(x.registration.start(x.i.invite_token,input,x.browser),e=>e.status===400);
  await assert.rejects(x.registration.start(x.i.invite_token,{...body,contact_notice_version:"old"},x.browser),e=>e.code==="PARTICIPATION_REQUIREMENTS_CHANGED");
  await assert.rejects(x.registration.landing(token()),e=>e.status===404);await x.invitations.revoke(x.session.token,x.design.id,x.design.groups[0].id,x.i.id,{expected_revision:0});
  await assert.rejects(x.registration.landing(x.i.invite_token),e=>e.status===404);await assert.rejects(x.registration.start(x.i.invite_token,body,x.browser),e=>e.status===404);assert.equal((await counts(f,x.design.id)).pending,0);
});
scenario("persistent email/browser issuance throttle precedes hashing and survives adapter recreation",async(f,x)=>{
  let hashes=0;const hashing=async(...args)=>{hashes++;return derive(...args);};
  for(let n=0;n<5;n++)await new PostgresRegistrationStart(f.runtime,x.vault,hashing).start(x.i.invite_token,body,token());
  await assert.rejects(new PostgresRegistrationStart(f.runtime,x.vault,hashing).start(x.i.invite_token,body,token()),e=>e.status===429&&e.code==="REGISTRATION_THROTTLED");assert.equal(hashes,5);
  assert.equal((await f.admin.query("SELECT count(*)::integer n FROM pedpsy.access_audit_events WHERE study_id=$1 AND action='participants.registration.throttled' AND outcome='deny'",[x.design.id])).rows[0].n,1);
});
scenario("mandatory queue audit failure keeps only transient reservation, no password material/outbox/clinical writes",async(f,x)=>{
  await f.admin.query("CREATE FUNCTION pedpsy.synthetic_registration_audit_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='participants.registration.requested' THEN RAISE EXCEPTION 'synthetic queue failure'; END IF; RETURN NEW; END $$;CREATE TRIGGER synthetic_registration_audit_fail BEFORE INSERT ON pedpsy.access_audit_events FOR EACH ROW EXECUTE FUNCTION pedpsy.synthetic_registration_audit_fail()");
  await assert.rejects(x.registration.start(x.i.invite_token,body,x.browser),/synthetic queue failure/);
  const p=(await f.admin.query("SELECT status,password_hash,salt,confirmation_hash FROM pedpsy.registration_pending WHERE study_id=$1",[x.design.id])).rows[0];assert.deepEqual(p,{status:"reserved",password_hash:null,salt:null,confirmation_hash:null});
  assert.deepEqual(await counts(f,x.design.id),{pending:1,outbox:0,participants:0,enrollments:0,attempts:0});
});
for(const mutation of ["revocation","closure","notice"])scenario(mutation+" committed during hashing prevents stale queue commit",async(f,x)=>{
  let signal,release;const entered=new Promise(r=>signal=r),pause=new Promise(r=>release=r);
  const registration=new PostgresRegistrationStart(f.runtime,x.vault,async(...args)=>{signal();await pause;return derive(...args);});
  const pending=registration.start(x.i.invite_token,body,x.browser).then(value=>({value}),error=>({error}));await entered;
  try{if(mutation==="revocation")await x.invitations.revoke(x.session.token,x.design.id,x.design.groups[0].id,x.i.id,{expected_revision:0});
    else if(mutation==="closure")await x.studies.lifecycle(x.session.token,x.design.id,{status:"closed",expected_version:x.design.version});
    else{await f.admin.query("INSERT INTO pedpsy.contact_notices VALUES('demo-contact-2','Changed synthetic notice','synthetic_only')");await f.admin.query("UPDATE pedpsy.study_contact_policies SET notice_version='demo-contact-2' WHERE study_id=$1",[x.design.id]);}
  }finally{release();}
  const result=await pending;assert.equal(result.error?.status,mutation==="notice"?409:404);assert.equal((await counts(f,x.design.id)).outbox,0);assert.equal((await counts(f,x.design.id)).participants,0);
});
scenario("runtime table/private helpers closed; pending scope and outbox recipient/envelope immutable",async(f,x)=>{
  await x.registration.start(x.i.invite_token,body,x.browser);
  for(const sql of ["SELECT * FROM pedpsy.registration_pending","SELECT * FROM pedpsy.contact_confirmation_outbox","SELECT * FROM pedpsy.contact_notices","SELECT * FROM pedpsy.study_contact_policies","DELETE FROM pedpsy.registration_pending","SELECT pedpsy.lock_registration_invite('x')","SELECT pedpsy.registration_audit('x',gen_random_uuid(),gen_random_uuid(),true)"])
    await assert.rejects(f.runtime.query(sql),e=>e.code==="42501");
  await assert.rejects(f.admin.query("UPDATE pedpsy.registration_pending SET group_id=$1",[x.design.groups[1].id]),e=>e.code==="23514");
  await assert.rejects(f.admin.query("UPDATE pedpsy.registration_pending SET password_hash=repeat('a',128)"),e=>e.code==="23514");
  await assert.rejects(f.admin.query("UPDATE pedpsy.contact_confirmation_outbox SET recipient='other@example.test'"),e=>e.code==="23514");
  await assert.rejects(f.admin.query("UPDATE pedpsy.contact_notices SET body='Unapproved change'"),e=>e.code==="23514");
  assert.equal((await counts(f,x.design.id)).participants,0);
});
scenario("metadata/live pending caps reject whole operation without hashing or truncation",async(f,x)=>{
  await f.admin.query("UPDATE pedpsy.studies SET title=repeat('x',201) WHERE id=$1",[x.design.id]);await assert.rejects(x.registration.landing(x.i.invite_token),e=>e.status===413);
  const at=Date.now();await f.admin.query("INSERT INTO pedpsy.registration_pending(id,study_id,group_id,invitation_id,invitation_revision,browser_hash,email_key,contact_notice_version,created_at_ms,expires_at_ms) SELECT gen_random_uuid(),$1,$2,$3,0,$4,'cap'||n::text||'@example.test','demo-contact-1',$5::bigint,$5::bigint+60000 FROM generate_series(1,1000) n",[x.design.id,x.design.groups[0].id,x.i.id,tokenHash(token()),at]);
  let hashes=0;const r=new PostgresRegistrationStart(f.runtime,x.vault,async(...args)=>{hashes++;return derive(...args);});
  await assert.rejects(r.start(x.i.invite_token,body,x.browser),e=>e.code==="REGISTRATION_LIMIT");assert.equal(hashes,0);assert.equal((await counts(f,x.design.id)).outbox,0);
});
scenario("closure committed during confirmed SQL lock wait denies stale pre-read before queue/audit",async(f,x)=>{
  let signal,release;const entered=new Promise(r=>signal=r),pause=new Promise(r=>release=r),owner=await f.admin.connect();let pending;
  const r=new PostgresRegistrationStart(f.runtime,x.vault,async(...args)=>{signal();await pause;return derive(...args);});
  try{pending=r.start(x.i.invite_token,body,x.browser).then(value=>({value}),error=>({error}));await entered;
    await owner.query("BEGIN");await owner.query("SELECT id FROM pedpsy.studies WHERE id=$1 FOR UPDATE",[x.design.id]);release();
    const until=Date.now()+2000;let waiting=false;while(Date.now()<until){waiting=(await f.admin.query("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=$1 AND wait_event_type='Lock' AND query LIKE '%queue_registration_confirmation%') waiting",[f.database])).rows[0].waiting;if(waiting)break;await new Promise(r=>setTimeout(r,10));}
    assert.ok(waiting,"queue never reached SQL lock wait");await owner.query("UPDATE pedpsy.studies SET status='closed' WHERE id=$1",[x.design.id]);await owner.query("COMMIT");assert.equal((await pending).error?.status,404);
  }finally{release?.();await owner.query("ROLLBACK");owner.release();if(pending)await pending;}
  assert.equal((await counts(f,x.design.id)).outbox,0);assert.equal((await f.admin.query("SELECT count(*)::integer n FROM pedpsy.access_audit_events WHERE study_id=$1 AND action='participants.registration.requested'",[x.design.id])).rows[0].n,0);
});
scenario("full pg_dump restore preserves queued token/binding/policy with separately retained key and closed runtime grants",async(f,x)=>{
  const {dockerTool}=require("./pg-container-fixture.js"),{grantRuntime,migratePostgres}=require("../dist/src/adapters/postgres/migrate.js"),path=require("node:path");
  await x.registration.start(x.i.invite_token,body,x.browser);const original=(await f.admin.query("SELECT p.*,o.id delivery_id,o.token_envelope FROM pedpsy.registration_pending p JOIN pedpsy.contact_confirmation_outbox o ON o.pending_id=p.id WHERE p.study_id=$1",[x.design.id])).rows[0];
  const target=await postgresFixture({initialize:false,seedData:false});let archive;
  try{for(const db of [f.database,target.database])assert.match(db,/^pedpsy_ci_[a-f0-9]{16}$/);
    archive=await dockerTool(["pg_dump","-U","postgres","--format=custom","--no-owner","--no-privileges",f.database]);assert.equal(archive.subarray(0,5).toString(),"PGDMP");
    await dockerTool(["pg_restore","-U","postgres","--dbname="+target.database,"--no-owner","--no-privileges","--single-transaction","--exit-on-error"],archive);
    const c=await target.admin.connect();try{
      // ACL-free restore remains quarantined until the same default-deny gate.
      await c.query("REVOKE ALL ON SCHEMA pedpsy FROM PUBLIC; REVOKE CREATE ON SCHEMA public FROM PUBLIC; REVOKE ALL ON ALL TABLES IN SCHEMA pedpsy FROM PUBLIC; REVOKE ALL ON ALL FUNCTIONS IN SCHEMA pedpsy FROM PUBLIC; REVOKE ALL ON public.pedpsy_schema_migrations FROM PUBLIC");
      await grantRuntime(c,target.runtimeRole);assert.equal(await migratePostgres(c,path.join(__dirname,"../storage/postgres")),0);
      const restored=(await c.query("SELECT p.*,o.id delivery_id,o.token_envelope FROM pedpsy.registration_pending p JOIN pedpsy.contact_confirmation_outbox o ON o.pending_id=p.id WHERE p.id=$1",[original.id])).rows[0];
      assert.ok(JSON.stringify(restored)===JSON.stringify(original),"operational backup row mismatch");assert.ok(tokenHash(x.vault.open(restored.delivery_id,restored.token_envelope))===restored.confirmation_hash,"retained-key recovery failed");
      assert.equal((await c.query("SELECT notice_version FROM pedpsy.study_contact_policies WHERE study_id=$1",[x.design.id])).rows[0].notice_version,"demo-contact-1");
      for(const sql of ["SELECT * FROM pedpsy.registration_pending","SELECT * FROM pedpsy.contact_confirmation_outbox","SELECT pedpsy.lock_registration_invite('x')"])
        await assert.rejects(target.runtime.query(sql),e=>e.code==="42501");
      assert.equal((await c.query("SELECT count(*)::integer n FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.pronamespace='pedpsy'::regnamespace AND a.grantee=0 AND a.privilege_type='EXECUTE'")).rows[0].n,0);
    }finally{c.release();}
    assert.equal((await counts(f,x.design.id)).outbox,1);
  }finally{archive?.fill(0);await target.close();}
});
