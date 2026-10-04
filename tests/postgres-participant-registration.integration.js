"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict"),{randomBytes,randomUUID}=require("node:crypto");
const {postgresFixture}=require("./postgres-fixture.js"),{verifiedStaff}=require("./mfa-fixture.js"),{invitationResearcher}=require("./group-invitation-fixture.js");
const {PostgresParticipantRegistration}=require("../dist/src/adapters/postgres/participant-registration.js"),{ContactTokenVault}=require("../dist/src/adapters/security/contact-token-vault.js");
const {PostgresParticipantGateway}=require("../dist/src/adapters/postgres/identity.js"),{PostgresUnitOfWork}=require("../dist/src/adapters/postgres/unit-of-work.js");
const {tokenHash}=require("../dist/src/adapters/postgres/account-transaction.js"),{derive}=require("../storage/access.js");
const body={email:"Confirmed.Owner+tag@EXAMPLE.test",password:"synthetic participant password",contact_notice_version:"demo-contact-1",accept_contact_notice:true};
const token=()=>randomBytes(32).toString("base64url");
async function configured(f){const s=await verifiedStaff(f),x=await invitationResearcher(f,s),i=await x.invitations.create(x.session.token,x.design.id,x.design.groups[0].id,{expires_at:Date.now()+86400000}),vault=new ContactTokenVault(randomBytes(32));return {...x,s,i,vault,registration:new PostgresParticipantRegistration(f.runtime,vault),browser:token()};}
function scenario(name,fn){test("PostgreSQL participant registration: "+name,async t=>{const f=await postgresFixture({runtimePoolSize:3});t.after(()=>f.close());await fn(f,await configured(f));});}
async function requested(f,x,{browser=x.browser,input=body,invite=x.i.invite_token}={}){
  assert.deepEqual(await x.registration.start(invite,input,browser),{status:"confirmation_requested"});
  const row=(await f.admin.query("SELECT p.*,o.id delivery_id,o.token_envelope FROM pedpsy.registration_pending p JOIN pedpsy.contact_confirmation_outbox o ON o.pending_id=p.id WHERE p.browser_hash=$1 AND p.status='pending' ORDER BY p.ready_at_ms DESC LIMIT 1",[tokenHash(browser)])).rows[0];
  return {row,code:x.vault.open(row.delivery_id,row.token_envelope),browser,invite};
}
async function confirm(x,proof){return x.registration.confirm(proof.invite,{confirmation_token:proof.code},proof.browser);}
async function identity(f,study){return (await f.admin.query("SELECT c.*,p.display_code,b.group_id,k.id credential_id,k.login_id,k.salt,k.password_hash,k.version,k.status credential_status FROM pedpsy.participant_contacts c JOIN pedpsy.participants p ON (p.study_id,p.id)=(c.study_id,c.participant_id) JOIN pedpsy.participant_group_bindings b ON (b.study_id,b.participant_id)=(p.study_id,p.id) JOIN pedpsy.participant_credentials k ON (k.study_id,k.participant_id)=(p.study_id,p.id) WHERE c.study_id=$1",[study])).rows[0];}
const noClinical=async(f,study)=>assert.equal((await f.admin.query("SELECT (SELECT count(*) FROM pedpsy.stage_enrollments WHERE study_id=$1)+(SELECT count(*) FROM pedpsy.attempts WHERE study_id=$1) n",[study])).rows[0].n,"0");
scenario("one-time proof creates salted credential/fixed group/private contact and only contact acknowledgement; no session or clinical records",async(f,x)=>{
  const proof=await requested(f,x);assert.deepEqual(await confirm(x,proof),{status:"sign_in_required"});const c=await identity(f,x.design.id);
  assert.equal(c.group_id,x.design.groups[0].id);assert.equal(c.email_key,"Confirmed.Owner+tag@example.test");assert.equal(c.source_pending_id,proof.row.id);assert.equal(c.status,"active");assert.ok(c.salt===proof.row.salt&&c.password_hash===proof.row.password_hash,"pending material changed");assert.match(c.display_code,/^P-[A-F0-9]{32}$/);
  assert.equal((await f.admin.query("SELECT status FROM pedpsy.registration_pending WHERE id=$1",[proof.row.id])).rows[0].status,"confirmed");assert.equal((await f.admin.query("SELECT count(*)::integer n FROM pedpsy.participant_sessions WHERE credential_id=$1",[c.credential_id])).rows[0].n,0);
  assert.equal((await f.admin.query("SELECT notice_version FROM pedpsy.participant_contact_acceptances WHERE pending_id=$1",[proof.row.id])).rows[0].notice_version,"demo-contact-1");
  const a=(await f.admin.query("SELECT * FROM pedpsy.access_audit_events WHERE study_id=$1 AND action='participants.registration.confirmed'",[x.design.id])).rows[0];assert.equal(a.resource_id,proof.row.id);for(const v of [body.email,body.password,proof.code,proof.browser,proof.invite])assert.ok(!JSON.stringify(a).includes(v));
  await assert.rejects(confirm(x,proof),e=>e.status===404);await noClinical(f,x.design.id);
});
scenario("wrong confirmation attempts persist across adapters, fifth cancels own request/unsent mail; correct code after exhaustion denied",async(f,x)=>{
  const p=await requested(f,x);for(let n=0;n<5;n++){const r=new PostgresParticipantRegistration(f.runtime,x.vault);await assert.rejects(r.confirm(p.invite,{confirmation_token:token()},p.browser),e=>e.status===404);assert.equal((await f.admin.query("SELECT attempts_remaining FROM pedpsy.registration_pending WHERE id=$1",[p.row.id])).rows[0].attempts_remaining,4-n);}
  const row=(await f.admin.query("SELECT p.status,o.status delivery_status FROM pedpsy.registration_pending p JOIN pedpsy.contact_confirmation_outbox o ON o.pending_id=p.id WHERE p.id=$1",[p.row.id])).rows[0];assert.deepEqual(row,{status:"cancelled",delivery_status:"cancelled"});await assert.rejects(confirm(x,p),e=>e.status===404);assert.equal(await identity(f,x.design.id),undefined);
});
scenario("wrong browser/invite/purpose/body cannot consume another request; replay cannot decrement a newer pending request",async(f,x)=>{
  const p=await requested(f,x);for(const [invite,code,browser] of [[p.invite,p.code,token()],[token(),p.code,p.browser],[p.invite,p.invite,p.browser],[p.invite,p.browser,p.browser]])await assert.rejects(x.registration.confirm(invite,{confirmation_token:code},browser),e=>[400,404].includes(e.status));
  await assert.rejects(x.registration.confirm(p.invite,{confirmation_token:p.code,role:"administrator"},p.browser),e=>e.status===404);assert.equal((await f.admin.query("SELECT attempts_remaining FROM pedpsy.registration_pending WHERE id=$1",[p.row.id])).rows[0].attempts_remaining,5);
  await confirm(x,p);const next=await requested(f,x);await assert.rejects(confirm(x,p),e=>e.status===404);assert.equal((await f.admin.query("SELECT attempts_remaining FROM pedpsy.registration_pending WHERE id=$1",[next.row.id])).rows[0].attempts_remaining,5);
});
scenario("concurrent confirmation consumes exactly once and one identity/audit/ack; no duplicate session or enrollment",async(f,x)=>{
  const p=await requested(f,x),results=await Promise.allSettled([confirm(x,p),new PostgresParticipantRegistration(f.runtime,x.vault).confirm(p.invite,{confirmation_token:p.code},p.browser)]);
  assert.equal(results.filter(r=>r.status==="fulfilled").length,1);assert.equal(results.find(r=>r.status==="rejected").reason.status,404);
  for(const table of ["participants","participant_group_bindings","participant_contacts","participant_contact_acceptances"])assert.equal((await f.admin.query("SELECT count(*)::integer n FROM pedpsy."+table+" WHERE study_id=$1",[x.design.id])).rows[0].n,1);await noClinical(f,x.design.id);
});
scenario("already-known mailbox proof preserves participant/group/password, including another group link; original password login only",async(f,x)=>{
  const p=await requested(f,x);await confirm(x,p);const before=await identity(f,x.design.id),i=await x.invitations.create(x.session.token,x.design.id,x.design.groups[1].id,{expires_at:Date.now()+86400000});
  const next=await requested(f,x,{browser:token(),invite:i.invite_token,input:{...body,password:"different participant password"}});assert.deepEqual(await confirm(x,next),{status:"sign_in_required"});const after=await identity(f,x.design.id);assert.ok(JSON.stringify(before)===JSON.stringify(after),"existing identity changed");
  await assert.rejects(x.registration.login({study_id:x.design.id,email:body.email,password:"different participant password"}),e=>e.code==="INVALID_LOGIN");const session=await x.registration.login({study_id:x.design.id,email:body.email,password:body.password});assert.match(session.token,/^[A-Za-z0-9_-]{43}$/);await noClinical(f,x.design.id);
});
scenario("same email in separate study creates separate identity/password scope, not global merge or cross-study login",async(f,x)=>{
  await confirm(x,await requested(f,x));const other=await invitationResearcher(f,x.s),i=await other.invitations.create(other.session.token,other.design.id,other.design.groups[0].id,{expires_at:Date.now()+86400000}),y={...other,i,vault:x.vault,registration:x.registration,browser:token()};
  const alternate="separate study password";await confirm(y,await requested(f,y,{input:{...body,password:alternate}}));const a=await identity(f,x.design.id),b=await identity(f,y.design.id);assert.notEqual(a.participant_id,b.participant_id);assert.notEqual(a.credential_id,b.credential_id);
  await assert.rejects(x.registration.login({study_id:y.design.id,email:body.email,password:body.password}),e=>e.status===401);await x.registration.login({study_id:y.design.id,email:body.email,password:alternate});
});
for(const mutation of ["revocation","closure","notice","expiry"])scenario(mutation+" before confirmation is rechecked, does not create identity or consume valid proof",async(f,x)=>{
  const p=await requested(f,x);if(mutation==="revocation")await x.invitations.revoke(x.session.token,x.design.id,x.design.groups[0].id,x.i.id,{expected_revision:0});
  else if(mutation==="closure")await x.studies.lifecycle(x.session.token,x.design.id,{status:"closed",expected_version:x.design.version});
  else if(mutation==="notice"){await f.admin.query("INSERT INTO pedpsy.contact_notices VALUES('demo-contact-2','Synthetic changed notice','synthetic_only')");await f.admin.query("UPDATE pedpsy.study_contact_policies SET notice_version='demo-contact-2' WHERE study_id=$1",[x.design.id]);}
  else{const fixtureOwner=await f.admin.connect();try{await fixtureOwner.query("BEGIN;SET LOCAL session_replication_role=replica");await fixtureOwner.query("UPDATE pedpsy.registration_pending SET expires_at_ms=ready_at_ms+1 WHERE id=$1",[p.row.id]);await fixtureOwner.query("COMMIT");}catch(e){await fixtureOwner.query("ROLLBACK");throw e;}finally{fixtureOwner.release();}}
  await assert.rejects(confirm(x,p),e=>e.status===(mutation==="notice"?409:404));assert.equal(await identity(f,x.design.id),undefined);
  assert.equal((await f.admin.query("SELECT attempts_remaining FROM pedpsy.registration_pending WHERE id=$1",[p.row.id])).rows[0].attempts_remaining,5);
});
scenario("mandatory confirmation audit failure rolls back participant/credential/contact/ack and keeps token pending",async(f,x)=>{
  const p=await requested(f,x);await f.admin.query("CREATE FUNCTION pedpsy.synthetic_confirm_audit_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='participants.registration.confirmed' THEN RAISE EXCEPTION 'synthetic confirm failure'; END IF;RETURN NEW;END $$;CREATE TRIGGER synthetic_confirm_audit_fail BEFORE INSERT ON pedpsy.access_audit_events FOR EACH ROW EXECUTE FUNCTION pedpsy.synthetic_confirm_audit_fail()");
  await assert.rejects(confirm(x,p),/synthetic confirm failure/);assert.equal(await identity(f,x.design.id),undefined);assert.equal((await f.admin.query("SELECT status FROM pedpsy.registration_pending WHERE id=$1",[p.row.id])).rows[0].status,"pending");assert.equal((await f.admin.query("SELECT status FROM pedpsy.contact_confirmation_outbox WHERE pending_id=$1",[p.row.id])).rows[0].status,"ready");await noClinical(f,x.design.id);
});
scenario("runtime/private/default public access closed; fixed contact/group/acceptance cannot be rewritten or silently reactivated",async(f,x)=>{
  await confirm(x,await requested(f,x));const c=await identity(f,x.design.id);
  for(const table of ["participant_contacts","participant_group_bindings","participant_contact_acceptances"])for(const verb of ["SELECT * FROM ","DELETE FROM "])await assert.rejects(f.runtime.query(verb+"pedpsy."+table),e=>e.code==="42501");
  await assert.rejects(f.runtime.query("SELECT pedpsy.guard_participant_contact()"),e=>e.code==="42501");
  await assert.rejects(f.admin.query("UPDATE pedpsy.participant_contacts SET email_key='other@example.test' WHERE id=$1",[c.id]),e=>e.code==="23514");await assert.rejects(f.admin.query("UPDATE pedpsy.participant_group_bindings SET group_id=$1 WHERE study_id=$2",[x.design.groups[1].id,x.design.id]),e=>e.code==="23514");
  await assert.rejects(f.admin.query("DELETE FROM pedpsy.participant_contact_acceptances WHERE study_id=$1",[x.design.id]),e=>e.code==="23514");await f.admin.query("UPDATE pedpsy.participant_contacts SET status='withdrawn' WHERE id=$1",[c.id]);await assert.rejects(f.admin.query("UPDATE pedpsy.participant_contacts SET status='active' WHERE id=$1",[c.id]),e=>e.code==="23514");
  await confirm(x,await requested(f,x,{browser:token()}));assert.equal((await identity(f,x.design.id)).status,"withdrawn");await assert.rejects(x.registration.login({study_id:x.design.id,email:body.email,password:body.password}),e=>e.code==="INVALID_LOGIN");
});
scenario("confirmed email login reuses established session rotation and own no-attempt projection; recruitment revoke does not exclude accepted participant",async(f,x)=>{
  await confirm(x,await requested(f,x));await x.invitations.revoke(x.session.token,x.design.id,x.design.groups[0].id,x.i.id,{expected_revision:0});const input={study_id:x.design.id,email:body.email,password:body.password},gateway=new PostgresParticipantGateway(f.runtime,new PostgresUnitOfWork(f.runtime));
  const first=await x.registration.login(input),a=await gateway.session(first.token);assert.equal(a.context.studyId,x.design.id);assert.equal(a.context.participantId,(await identity(f,x.design.id)).participant_id);assert.deepEqual(a.attempts,[]);assert.equal(a.csrf,first.csrf);
  const next=await x.registration.login(input);assert.notEqual(next.token,first.token);await assert.rejects(gateway.session(first.token),e=>e.status===401);assert.deepEqual((await gateway.session(next.token)).attempts,[]);await noClinical(f,x.design.id);
});
scenario("unknown/wrong/unconfirmed/foreign email runs dummy hash and same invalid login; scoped throttle durable and shared with legacy credential",async(f,x)=>{
  let hashes=0;const r=new PostgresParticipantRegistration(f.runtime,x.vault,async(...args)=>{hashes++;return derive(...args);}),input={study_id:x.design.id,email:body.email,password:body.password};
  await requested(f,x);await assert.rejects(r.login(input),e=>e.code==="INVALID_LOGIN");await assert.rejects(r.login({...input,study_id:randomUUID()}),e=>e.code==="INVALID_LOGIN");assert.equal(hashes,2);
  const p=(await f.admin.query("SELECT o.id,o.token_envelope FROM pedpsy.contact_confirmation_outbox o JOIN pedpsy.registration_pending p ON p.id=o.pending_id WHERE p.study_id=$1",[x.design.id])).rows[0];await x.registration.confirm(x.i.invite_token,{confirmation_token:x.vault.open(p.id,p.token_envelope)},x.browser);
  for(let n=0;n<4;n++)await assert.rejects(new PostgresParticipantRegistration(f.runtime,x.vault).login({...input,password:"incorrect participant password"}),e=>e.code==="INVALID_LOGIN");
  await assert.rejects(r.login(input),e=>e.code==="LOGIN_THROTTLED");assert.equal(hashes,2);const c=await identity(f,x.design.id),gateway=new PostgresParticipantGateway(f.runtime,new PostgresUnitOfWork(f.runtime));
  // Unconfirmed attempt already used the email bucket. Legacy per-code bucket
  // has four failures and one remaining admission; neither route resets it.
  await assert.rejects(gateway.login({login_id:c.login_id,password:"incorrect participant password"}),e=>e.code==="INVALID_LOGIN");await assert.rejects(gateway.login({login_id:c.login_id,password:body.password}),e=>e.code==="LOGIN_THROTTLED");
});
for(const mutation of ["credential","contact","participant","group","study","notice"])scenario(mutation+" committed during hashing denies stale email login/session",async(f,x)=>{
  await confirm(x,await requested(f,x));const c=await identity(f,x.design.id);let signal,release;const entered=new Promise(r=>signal=r),pause=new Promise(r=>release=r),r=new PostgresParticipantRegistration(f.runtime,x.vault,async(...args)=>{signal();await pause;return derive(...args);});
  const pending=r.login({study_id:x.design.id,email:body.email,password:body.password}).then(value=>({value}),error=>({error}));await entered;
  try{if(mutation==="credential")await f.admin.query("UPDATE pedpsy.participant_credentials SET version=version+1 WHERE id=$1",[c.credential_id]);
    else if(mutation==="contact")await f.admin.query("UPDATE pedpsy.participant_contacts SET status='withdrawn' WHERE id=$1",[c.id]);
    else if(mutation==="participant")await f.admin.query("UPDATE pedpsy.participants SET status='excluded' WHERE id=$1",[c.participant_id]);
    else if(mutation==="group")await f.admin.query("UPDATE pedpsy.research_groups SET status='closed' WHERE id=$1",[c.group_id]);
    else if(mutation==="study")await x.studies.lifecycle(x.session.token,x.design.id,{status:"closed",expected_version:x.design.version});
    else{await f.admin.query("INSERT INTO pedpsy.contact_notices VALUES('demo-contact-2','Synthetic new notice','synthetic_only')");await f.admin.query("UPDATE pedpsy.study_contact_policies SET notice_version='demo-contact-2' WHERE study_id=$1",[x.design.id]);}
  }finally{release();}assert.equal((await pending).error?.code,"INVALID_LOGIN");assert.equal((await f.admin.query("SELECT count(*)::integer n FROM pedpsy.participant_sessions WHERE credential_id=$1",[c.credential_id])).rows[0].n,0);
});
scenario("current contact withdrawal committed after confirmed SQL lock wait denies session, not only stale JS/pre-read",async(f,x)=>{
  await confirm(x,await requested(f,x));const c=await identity(f,x.design.id);let signal,release;const entered=new Promise(r=>signal=r),pause=new Promise(r=>release=r),r=new PostgresParticipantRegistration(f.runtime,x.vault,async(...args)=>{signal();await pause;return derive(...args);}),owner=await f.admin.connect();let pending;
  try{pending=r.login({study_id:x.design.id,email:body.email,password:body.password}).then(value=>({value}),error=>({error}));await entered;await owner.query("BEGIN");await owner.query("SELECT id FROM pedpsy.participant_contacts WHERE id=$1 FOR UPDATE",[c.id]);release();
    const until=Date.now()+2000;let waiting=false;while(Date.now()<until){waiting=(await f.admin.query("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=$1 AND wait_event_type='Lock' AND query LIKE '%finish_participant_email_login%') waiting",[f.database])).rows[0].waiting;if(waiting)break;await new Promise(r=>setTimeout(r,10));}assert.ok(waiting,"login never reached SQL lock wait");await owner.query("UPDATE pedpsy.participant_contacts SET status='withdrawn' WHERE id=$1",[c.id]);await owner.query("COMMIT");assert.equal((await pending).error?.code,"INVALID_LOGIN");
  }finally{release?.();await owner.query("ROLLBACK");owner.release();if(pending)await pending;}
  assert.equal((await f.admin.query("SELECT count(*)::integer n FROM pedpsy.participant_sessions WHERE credential_id=$1",[c.credential_id])).rows[0].n,0);
});
scenario("closure committed after confirmed SQL lock wait denies confirmation before any identity/allow audit",async(f,x)=>{
  const p=await requested(f,x),owner=await f.admin.connect();let pending;
  try{await owner.query("BEGIN");await owner.query("SELECT id FROM pedpsy.studies WHERE id=$1 FOR UPDATE",[x.design.id]);pending=confirm(x,p).then(value=>({value}),error=>({error}));
    const until=Date.now()+2000;let waiting=false;while(Date.now()<until){waiting=(await f.admin.query("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=$1 AND wait_event_type='Lock' AND query LIKE '%confirm_registration_email%') waiting",[f.database])).rows[0].waiting;if(waiting)break;await new Promise(r=>setTimeout(r,10));}assert.ok(waiting,"confirmation never reached SQL lock wait");
    await owner.query("UPDATE pedpsy.studies SET status='closed' WHERE id=$1",[x.design.id]);await owner.query("COMMIT");assert.equal((await pending).error?.status,404);
  }finally{await owner.query("ROLLBACK");owner.release();if(pending)await pending;}
  assert.equal(await identity(f,x.design.id),undefined);assert.equal((await f.admin.query("SELECT count(*)::integer n FROM pedpsy.access_audit_events WHERE study_id=$1 AND action='participants.registration.confirmed'",[x.design.id])).rows[0].n,0);
});
scenario("required login audit failure rolls back both new session and revocation of previous session",async(f,x)=>{
  await confirm(x,await requested(f,x));const input={study_id:x.design.id,email:body.email,password:body.password},first=await x.registration.login(input),c=await identity(f,x.design.id);
  await f.admin.query("CREATE FUNCTION pedpsy.synthetic_email_login_audit_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='participant_login' AND NEW.outcome='allow' THEN RAISE EXCEPTION 'synthetic email login failure'; END IF;RETURN NEW;END $$;CREATE TRIGGER synthetic_email_login_audit_fail BEFORE INSERT ON pedpsy.access_audit_events FOR EACH ROW EXECUTE FUNCTION pedpsy.synthetic_email_login_audit_fail()");
  await assert.rejects(x.registration.login(input),/synthetic email login failure/);assert.equal((await f.admin.query("SELECT count(*)::integer n FROM pedpsy.participant_sessions WHERE credential_id=$1",[c.credential_id])).rows[0].n,1);
  const gateway=new PostgresParticipantGateway(f.runtime,new PostgresUnitOfWork(f.runtime));assert.equal((await gateway.session(first.token)).context.participantId,c.participant_id);
});
scenario("new current notice needs explicit reconfirmation, stores another contact acknowledgement without replacing password or clinical consent",async(f,x)=>{
  await confirm(x,await requested(f,x));const original=await identity(f,x.design.id),input={study_id:x.design.id,email:body.email,password:body.password};
  await f.admin.query("INSERT INTO pedpsy.contact_notices VALUES('demo-contact-2','Synthetic changed notice','synthetic_only')");await f.admin.query("UPDATE pedpsy.study_contact_policies SET notice_version='demo-contact-2' WHERE study_id=$1",[x.design.id]);await assert.rejects(x.registration.login(input),e=>e.code==="INVALID_LOGIN");
  await confirm(x,await requested(f,x,{browser:token(),input:{...body,password:"another new attempted password",contact_notice_version:"demo-contact-2"}}));assert.ok(JSON.stringify(await identity(f,x.design.id))===JSON.stringify(original),"reconfirmation changed identity");
  assert.equal((await f.admin.query("SELECT count(*)::integer n FROM pedpsy.participant_contact_acceptances WHERE study_id=$1",[x.design.id])).rows[0].n,2);await x.registration.login(input);await noClinical(f,x.design.id);
});
scenario("contact-linked internal display/login code cannot bypass the new email/current notice route, even with correct password",async(f,x)=>{
  await confirm(x,await requested(f,x));const c=await identity(f,x.design.id),gateway=new PostgresParticipantGateway(f.runtime,new PostgresUnitOfWork(f.runtime)),input={login_id:c.login_id,password:body.password};
  await assert.rejects(gateway.login(input),e=>e.code==="INVALID_LOGIN");assert.equal((await f.admin.query("SELECT count(*)::integer n FROM pedpsy.participant_sessions WHERE credential_id=$1",[c.credential_id])).rows[0].n,0);
  await x.registration.login({study_id:x.design.id,email:body.email,password:body.password});
  await f.admin.query("INSERT INTO pedpsy.contact_notices VALUES('demo-contact-2','Synthetic changed current notice','synthetic_only')");await f.admin.query("UPDATE pedpsy.study_contact_policies SET notice_version='demo-contact-2' WHERE study_id=$1",[x.design.id]);await assert.rejects(gateway.login(input),e=>e.code==="INVALID_LOGIN");
  await f.admin.query("UPDATE pedpsy.participant_contacts SET status='withdrawn' WHERE id=$1",[c.id]);await assert.rejects(gateway.login(input),e=>e.code==="INVALID_LOGIN");assert.equal((await f.admin.query("SELECT count(*)::integer n FROM pedpsy.participant_sessions WHERE credential_id=$1",[c.credential_id])).rows[0].n,1);
});
