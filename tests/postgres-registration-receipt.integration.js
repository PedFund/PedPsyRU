"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict"),{randomBytes}=require("node:crypto");
const {postgresFixture}=require("./postgres-fixture.js"),{verifiedStaff}=require("./mfa-fixture.js"),{invitationResearcher}=require("./group-invitation-fixture.js");
const {PostgresParticipantRegistration}=require("../dist/src/adapters/postgres/participant-registration.js"),{PostgresRegistrationReceipt}=require("../dist/src/adapters/postgres/registration-receipt.js");
const {ContactTokenVault}=require("../dist/src/adapters/security/contact-token-vault.js"),{tokenHash}=require("../dist/src/adapters/postgres/account-transaction.js");
const body={email:"Receipt.Owner@example.test",password:"synthetic receipt password",contact_notice_version:"demo-contact-2",accept_contact_notice:true},token=()=>randomBytes(32).toString("base64url");
async function configured(f){const s=await verifiedStaff(f),x=await invitationResearcher(f,s),i=await x.invitations.create(x.session.token,x.design.id,x.design.groups[0].id,{expires_at:Date.now()+86400000}),vault=new ContactTokenVault(randomBytes(32));return {...x,s,i,vault,registration:new PostgresParticipantRegistration(f.runtime,vault),receipts:new PostgresRegistrationReceipt(f.runtime,vault,true),browser:token()};}
function scenario(name,fn){test("PostgreSQL test registration receipt: "+name,async t=>{const f=await postgresFixture({runtimePoolSize:3});t.after(()=>f.close());await fn(f,await configured(f));});}
async function request(f,x){await x.registration.start(x.i.invite_token,body,x.browser);return (await f.admin.query("SELECT p.*,o.id delivery_id,o.token_envelope,o.status delivery_status FROM pedpsy.registration_pending p JOIN pedpsy.contact_confirmation_outbox o ON o.pending_id=p.id WHERE p.study_id=$1 AND p.status='pending'",[x.design.id])).rows[0];}
async function current(f,p){return (await f.admin.query("SELECT p.status,p.attempts_remaining,o.status delivery_status,o.sent_at_ms FROM pedpsy.registration_pending p JOIN pedpsy.contact_confirmation_outbox o ON o.pending_id=p.id WHERE p.id=$1",[p.id])).rows[0];}
async function noIdentity(f,x){const r=(await f.admin.query("SELECT (SELECT count(*) FROM pedpsy.participants WHERE study_id=$1)+(SELECT count(*) FROM pedpsy.stage_enrollments WHERE study_id=$1)+(SELECT count(*) FROM pedpsy.attempts WHERE study_id=$1)+(SELECT count(*) FROM pedpsy.participant_sessions WHERE study_id=$1) n",[x.design.id])).rows[0];assert.equal(r.n,"0");}
function beforeAck(pool){let signal,release;const entered=new Promise(r=>signal=r),pause=new Promise(r=>release=r);return {entered,release,pool:{connect:async()=>{const c=await pool.connect();return {release:()=>c.release(),query:async(...args)=>{if(args[0].includes("SELECT pedpsy.finish_registration_receipt")){signal();await pause;}return c.query(...args);}};}}};}
async function changedNotice(f,x){await f.admin.query("INSERT INTO pedpsy.contact_notices VALUES('demo-receipt-2','Synthetic changed receipt notice','synthetic_only')");await f.admin.query("UPDATE pedpsy.study_contact_policies SET notice_version='demo-receipt-2' WHERE study_id=$1",[x.design.id]);}
scenario("trusted context preserves old landing and creates no identity, clinical records or session",async(f,x)=>{
  const old=await x.registration.landing(x.i.invite_token),ctx=await x.receipts.context(x.i.invite_token);assert.deepEqual(ctx,{study_id:x.design.id,...old});assert.deepEqual(Object.keys(old).sort(),["contact_notice","group_name","study_title"]);
  await assert.rejects(x.receipts.receipt(x.i.invite_token,x.browser),e=>e.status===404);await noIdentity(f,x);
});
scenario("own explicit test delivery is idempotent before confirmation, commits sent/audit, never auto-signs-in",async(f,x)=>{
  const p=await request(f,x),first=await x.receipts.receipt(x.i.invite_token,x.browser),before=await current(f,p);assert.ok(JSON.stringify(first)===JSON.stringify({synthetic:true,confirmation_token:x.vault.open(p.delivery_id,p.token_envelope),expires_at:Number(p.expires_at_ms)}),"test receipt shape/code/expiry changed");
  assert.equal(before.delivery_status,"sent");assert.equal(before.status,"pending");assert.equal(before.attempts_remaining,5);assert.ok(Number(before.sent_at_ms)>0);assert.ok(JSON.stringify(await x.receipts.receipt(x.i.invite_token,x.browser))===JSON.stringify(first),"retry changed proof");assert.deepEqual(await current(f,p),before);await noIdentity(f,x);
  const audit=(await f.admin.query("SELECT * FROM pedpsy.access_audit_events WHERE study_id=$1 AND action LIKE 'participants.registration.receipt%'",[x.design.id])).rows;
  for(const secret of [body.email,body.password,first.confirmation_token,p.token_envelope,x.browser,x.i.invite_token])assert.ok(!JSON.stringify(audit).includes(secret));
  await x.registration.confirm(x.i.invite_token,{confirmation_token:first.confirmation_token},x.browser);await assert.rejects(x.receipts.receipt(x.i.invite_token,x.browser),e=>e.status===404);
  assert.equal((await f.admin.query("SELECT count(*) n FROM pedpsy.participant_sessions WHERE study_id=$1",[x.design.id])).rows[0].n,"0");
});
scenario("wrong browser/invitation/purpose cannot expose or mark somebody else's message",async(f,x)=>{
  const p=await request(f,x);for(const [i,b] of [[x.i.invite_token,token()],[token(),x.browser],[x.browser,x.i.invite_token],[x.i.invite_token,x.i.invite_token],["invalid",x.browser]])await assert.rejects(x.receipts.receipt(i,b),e=>e.status===404);
  assert.equal((await current(f,p)).delivery_status,"ready");assert.equal((await current(f,p)).attempts_remaining,5);await noIdentity(f,x);
});
scenario("cancelled/exhausted proof cannot be delivered or silently reactivated",async(f,x)=>{
  const p=await request(f,x);for(let n=0;n<5;n++)await assert.rejects(x.registration.confirm(x.i.invite_token,{confirmation_token:token()},x.browser),e=>e.status===404);
  await assert.rejects(x.receipts.receipt(x.i.invite_token,x.browser),e=>e.status===404);assert.deepEqual(await current(f,p),{status:"cancelled",attempts_remaining:0,delivery_status:"cancelled",sent_at_ms:null});await noIdentity(f,x);
});
scenario("wrong retained key leaves message ready; encryption is read only outside an SQL transaction",async(f,x)=>{
  const p=await request(f,x),wrong=new PostgresRegistrationReceipt(f.runtime,new ContactTokenVault(randomBytes(32)),true);
  await assert.rejects(wrong.receipt(x.i.invite_token,x.browser),e=>e.status===500&&e.code==="CONTACT_RECEIPT_UNAVAILABLE");assert.equal((await current(f,p)).delivery_status,"ready");
  let active=0,opened=false;const pool={connect:async()=>{const c=await f.runtime.connect();return {release:()=>c.release(),query:async(...a)=>{const result=await c.query(...a);if(a[0]==="BEGIN")active++;if(a[0]==="COMMIT"||a[0]==="ROLLBACK")active--;return result;}};}};
  const vault={open:(...args)=>{assert.equal(active,0,"crypto held a transaction");opened=true;return x.vault.open(...args);}};await new PostgresRegistrationReceipt(pool,vault,true).receipt(x.i.invite_token,x.browser);assert.ok(opened);
});
for(const mutation of ["envelope","digest"])scenario(mutation+" mismatch is neutral server failure, no delivered transition/plaintext returned",async(f,x)=>{
  const p=await request(f,x),owner=await f.admin.connect();try{await owner.query("BEGIN;SET LOCAL session_replication_role=replica");
    if(mutation==="envelope"){const parts=p.token_envelope.split("."),cipher=Buffer.from(parts[2],"base64url");cipher[0]^=1;parts[2]=cipher.toString("base64url");await owner.query("UPDATE pedpsy.contact_confirmation_outbox SET token_envelope=$2 WHERE id=$1",[p.delivery_id,parts.join(".")]);}
    else await owner.query("UPDATE pedpsy.registration_pending SET confirmation_hash=$2 WHERE id=$1",[p.id,tokenHash(token())]);await owner.query("COMMIT");
  }catch(e){await owner.query("ROLLBACK");throw e;}finally{owner.release();}
  await assert.rejects(x.receipts.receipt(x.i.invite_token,x.browser),e=>e.code==="CONTACT_RECEIPT_UNAVAILABLE");assert.equal((await current(f,p)).delivery_status,"ready");await noIdentity(f,x);
});
for(const mutation of ["revocation","closure","notice","replacement"])scenario(mutation+" between read and acknowledgement denies stale delivery",async(f,x)=>{
  const p=await request(f,x),barrier=beforeAck(f.runtime),r=new PostgresRegistrationReceipt(barrier.pool,x.vault,true),pending=r.receipt(x.i.invite_token,x.browser).then(value=>({value}),error=>({error}));await Promise.race([barrier.entered,pending.then(result=>{throw result.error??Error("receipt did not reach acknowledgement");})]);
  try{if(mutation==="revocation")await x.invitations.revoke(x.session.token,x.design.id,x.design.groups[0].id,x.i.id,{expected_revision:0});
    else if(mutation==="closure")await x.studies.lifecycle(x.session.token,x.design.id,{status:"closed",expected_version:x.design.version});
    else if(mutation==="notice")await changedNotice(f,x);else await x.registration.start(x.i.invite_token,body,x.browser);
  }finally{barrier.release();}const result=await pending;assert.ok(result.value===undefined,"stale receiver returned proof");assert.equal(result.error?.status,mutation==="notice"?409:404);assert.notEqual((await current(f,p)).delivery_status,"sent");await noIdentity(f,x);
});
scenario("expiry crossing a confirmed outbox lock wait is checked after the wait, not from material or before-lock time",async(f,x)=>{
  const p=await request(f,x),barrier=beforeAck(f.runtime),r=new PostgresRegistrationReceipt(barrier.pool,x.vault,true),owner=await f.admin.connect();let pending;
  try{pending=r.receipt(x.i.invite_token,x.browser).then(value=>({value}),error=>({error}));await Promise.race([barrier.entered,pending.then(result=>{throw result.error??Error("receipt did not reach acknowledgement");})]);await owner.query("BEGIN;SET LOCAL session_replication_role=replica");await owner.query("SELECT id FROM pedpsy.contact_confirmation_outbox WHERE id=$1 FOR UPDATE",[p.delivery_id]);barrier.release();
    const until=Date.now()+2000;let waiting=false;while(Date.now()<until){waiting=(await f.admin.query("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=$1 AND wait_event_type='Lock' AND query LIKE '%finish_registration_receipt%') waiting",[f.database])).rows[0].waiting;if(waiting)break;await new Promise(r=>setTimeout(r,10));}assert.ok(waiting,"receipt never reached SQL lock wait");
    await owner.query("UPDATE pedpsy.contact_confirmation_outbox SET expires_at_ms=floor(extract(epoch FROM clock_timestamp())*1000)::bigint+350 WHERE id=$1",[p.delivery_id]);await new Promise(r=>setTimeout(r,450));await owner.query("COMMIT");assert.equal((await pending).error?.status,404);
  }finally{barrier.release();await owner.query("ROLLBACK");owner.release();if(pending)await pending;}
  assert.equal((await current(f,p)).delivery_status,"ready");await noIdentity(f,x);
});
for(const step of ["read","delivered"])scenario("required "+step+" audit failure rolls back any sent write; no receipt",async(f,x)=>{
  const p=await request(f,x);await f.admin.query("CREATE FUNCTION pedpsy.synthetic_receipt_audit_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='participants.registration.receipt_"+step+"' THEN RAISE EXCEPTION 'synthetic receipt audit failure'; END IF;RETURN NEW;END $$;CREATE TRIGGER synthetic_receipt_audit_fail BEFORE INSERT ON pedpsy.access_audit_events FOR EACH ROW EXECUTE FUNCTION pedpsy.synthetic_receipt_audit_fail()");
  await assert.rejects(x.receipts.receipt(x.i.invite_token,x.browser),/synthetic receipt audit failure/);assert.equal((await current(f,p)).delivery_status,"ready");assert.equal((await current(f,p)).sent_at_ms,null);await noIdentity(f,x);
});
scenario("unavailable requests persist browser/global limits across adapter instances, no secret table/helper grants",async(f,x)=>{
  const unavailable=token();for(let n=0;n<10;n++)await assert.rejects(new PostgresRegistrationReceipt(f.runtime,x.vault,true).receipt(unavailable,x.browser),e=>e.status===404);
  await assert.rejects(x.receipts.receipt(unavailable,x.browser),e=>e.status===429);
  // The rejected browser request also used one global admission: 11 + 89 =100.
  for(let n=0;n<89;n++)await assert.rejects(x.receipts.receipt(unavailable,token()),e=>e.status===404);await assert.rejects(x.receipts.receipt(unavailable,token()),e=>e.status===429);
  for(const sql of ["SELECT * FROM pedpsy.contact_confirmation_outbox","SELECT * FROM pedpsy.registration_pending","SELECT pedpsy.lock_registration_receipt('x','y',NULL)"])await assert.rejects(f.runtime.query(sql),e=>e.code==="42501");
  assert.equal((await f.admin.query("SELECT count(*)::integer n FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a WHERE p.pronamespace='pedpsy'::regnamespace AND p.proname IN ('registration_context','lock_registration_receipt','registration_receipt_material','finish_registration_receipt') AND a.grantee=0 AND a.privilege_type='EXECUTE'")).rows[0].n,0);await noIdentity(f,x);
});
scenario("two concurrent receipt requests share one immutable sent transition and the same still-pending proof",async(f,x)=>{
  const p=await request(f,x),results=await Promise.all([x.receipts.receipt(x.i.invite_token,x.browser),new PostgresRegistrationReceipt(f.runtime,x.vault,true).receipt(x.i.invite_token,x.browser)]);
  assert.ok(JSON.stringify(results[0])===JSON.stringify(results[1]),"concurrent receipt changed proof");assert.equal((await current(f,p)).delivery_status,"sent");assert.equal((await current(f,p)).status,"pending");
  assert.equal((await f.admin.query("SELECT count(*) n FROM pedpsy.contact_confirmation_outbox WHERE pending_id=$1",[p.id])).rows[0].n,"1");await noIdentity(f,x);
});
