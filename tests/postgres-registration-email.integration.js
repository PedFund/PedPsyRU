"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict"),{randomBytes}=require("node:crypto");
const {postgresFixture}=require("./postgres-fixture.js"),{verifiedStaff}=require("./mfa-fixture.js"),{invitationResearcher}=require("./group-invitation-fixture.js");
const {PostgresRegistrationStart}=require("../dist/src/adapters/postgres/registration-start.js");
const {ContactTokenVault}=require("../dist/src/adapters/security/contact-token-vault.js");
const {ConfirmationMailWorker}=require("../dist/src/adapters/postgres/confirmation-mail-worker.js");
const {tokenHash}=require("../dist/src/adapters/postgres/account-transaction.js");
const body={email:"mail.worker@example.test",password:"synthetic participant email password",contact_notice_version:"demo-contact-3",accept_contact_notice:true};
const token=()=>randomBytes(32).toString("base64url");
async function configured(f){
  const s=await verifiedStaff(f),x=await invitationResearcher(f,s);
  const i=await x.invitations.create(x.session.token,x.design.id,x.design.groups[0].id,{expires_at:Date.now()+86400000});
  const vault=new ContactTokenVault(randomBytes(32));
  return {...x,i,vault,registration:new PostgresRegistrationStart(f.runtime,vault),browser:token()};
}
async function queue(f,x,{browser=x.browser,email=body.email}={}){
  await x.registration.start(x.i.invite_token,{...body,email},browser);
  return (await f.admin.query("SELECT o.* FROM pedpsy.contact_confirmation_outbox o JOIN pedpsy.registration_pending p ON p.id=o.pending_id WHERE p.browser_hash=$1",[tokenHash(browser)])).rows[0];
}
function fakeTransport(){const sent=[];return {sent,async send(message){sent.push(message);}};}
function worker(f,x,transport,allowlist=null){return new ConfirmationMailWorker(f.runtime,x.vault,transport,{batch:10,pollMs:1000,allowlist,rateLimit:20,rateWindowMs:300000},"https://mettest.vibemind.pro");}
function scenario(name,fn){test("PostgreSQL registration email: "+name,async t=>{const f=await postgresFixture({runtimePoolSize:2});t.after(()=>f.close());await fn(f,await configured(f));});}
async function outbox(f,id){return (await f.admin.query("SELECT status,sent_at_ms,attempts FROM pedpsy.contact_confirmation_outbox WHERE id=$1",[id])).rows[0];}
async function audit(f,id){return (await f.admin.query("SELECT action,outcome,reason FROM pedpsy.access_audit_events WHERE resource_id=$1 ORDER BY at_ms DESC,id DESC LIMIT 1",[id])).rows[0];}
scenario("claims, sends the encrypted one-time code and marks the outbox row sent without leaking it into audit",async(f,x)=>{
  const row=await queue(f,x),transport=fakeTransport();assert.equal(await worker(f,x,transport).tick(),1);
  assert.equal(transport.sent.length,1);assert.equal(transport.sent[0].to,body.email);
  assert.ok(transport.sent[0].subject.includes("Подтверждение участия"));
  assert.ok(transport.sent[0].text.includes("Код подтверждения: "+x.vault.open(row.id,row.token_envelope)));
  const stored=await outbox(f,row.id);assert.equal(stored.status,"sent");assert.ok(stored.sent_at_ms);assert.equal(stored.attempts,1);
  const event=await audit(f,row.id);assert.deepEqual(event,{action:"participants.registration.email",outcome:"allow",reason:"SENT"});
  assert.ok(!JSON.stringify(event).includes(body.email));
});
scenario("allowlist refuses an unexpected recipient without sending or retrying",async(f,x)=>{
  const row=await queue(f,x),transport=fakeTransport(),allowlist=new Set(["someone.else@example.test"]);
  assert.equal(await worker(f,x,transport,allowlist).tick(),1);assert.equal(transport.sent.length,0);
  assert.equal((await outbox(f,row.id)).status,"failed");
  assert.deepEqual(await audit(f,row.id),{action:"participants.registration.email",outcome:"deny",reason:"RECIPIENT_NOT_ALLOWED"});
});
scenario("SMTP failure leaves a bounded retry and records only a fixed reason",async(f,x)=>{
  const row=await queue(f,x),transport={sent:[],async send(){throw new Error("synthetic SMTP unavailable");}};
  assert.equal(await worker(f,x,transport).tick(),1);
  const stored=await outbox(f,row.id);assert.equal(stored.status,"ready");assert.equal(stored.attempts,1);
  assert.deepEqual(await audit(f,row.id),{action:"participants.registration.email",outcome:"deny",reason:"SMTP_ERROR"});
});
scenario("an exhausted code becomes terminal and is audited",async(f,x)=>{
  const row=await queue(f,x),owner=await f.admin.connect();
  try{await owner.query("BEGIN");await owner.query("SET LOCAL session_replication_role=replica");await owner.query("UPDATE pedpsy.contact_confirmation_outbox SET attempts=10,next_attempt_at_ms=created_at_ms WHERE id=$1",[row.id]);await owner.query("COMMIT");}finally{owner.release();}
  const status=(await f.runtime.query("SELECT pedpsy.finish_registration_confirmation($1,false,$2,'MAX_ATTEMPTS') status",[row.id,Date.now()])).rows[0].status;
  assert.equal(status,"failed");assert.equal((await outbox(f,row.id)).status,"failed");
  assert.deepEqual(await audit(f,row.id),{action:"participants.registration.email",outcome:"deny",reason:"MAX_ATTEMPTS"});
});
scenario("an expired code is failed by the stale sweep before any SMTP attempt",async(f,x)=>{
  const row=await queue(f,x),owner=await f.admin.connect();
  try{await owner.query("BEGIN");await owner.query("SET LOCAL session_replication_role=replica");await owner.query("UPDATE pedpsy.contact_confirmation_outbox SET expires_at_ms=created_at_ms+1,next_attempt_at_ms=created_at_ms WHERE id=$1",[row.id]);await owner.query("COMMIT");}finally{owner.release();}
  const transport=fakeTransport();assert.equal(await worker(f,x,transport).tick(),0);assert.equal(transport.sent.length,0);
  assert.equal((await outbox(f,row.id)).status,"failed");
  assert.deepEqual(await audit(f,row.id),{action:"participants.registration.email",outcome:"deny",reason:"EXPIRED"});
});
