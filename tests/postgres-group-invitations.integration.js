"use strict";
const {test} = require("node:test"), assert = require("node:assert/strict"), {randomUUID, randomBytes} = require("node:crypto");
const {postgresFixture} = require("./postgres-fixture.js"), {verifiedStaff} = require("./mfa-fixture.js");
const {invitationResearcher} = require("./group-invitation-fixture.js"), {studyResearcher} = require("./study-fixture.js");
const {tokenHash} = require("../dist/src/adapters/postgres/account-transaction.js");
function scenario(name, fn) {test("PostgreSQL group invites: " + name, async t => {
  const f = await postgresFixture({runtimePoolSize: 2}); t.after(() => f.close());
  const staff = await verifiedStaff(f), x = await invitationResearcher(f, staff); await fn(f, x, staff);
});}
const create = x => x.invitations.create(x.session.token, x.design.id, x.design.groups[0].id, {expires_at: Date.now()+86400000});
const revoke = (x, r) => x.invitations.revoke(x.session.token, x.design.id, x.design.groups[0].id, r.id, {expected_revision: r.revision});
async function count(f) {return (await f.admin.query("SELECT count(*)::integer n FROM pedpsy.group_invitations")).rows[0].n;}
scenario("one active shared token per group, stored hashed, list is secret-free; staff and чужой researcher denied", async (f,x,s) => {
  const r = await create(x); assert.match(r.invite_token, /^[A-Za-z0-9_-]{43}$/); assert.equal(r.revision, 0); assert.equal(r.status, "active");
  const {invite_token, ...record} = r;
  assert.deepEqual(await x.invitations.list(x.session.token,x.design.id,x.design.groups[0].id), [record]);
  const row = (await f.admin.query("SELECT * FROM pedpsy.group_invitations WHERE id=$1",[r.id])).rows[0];
  assert.equal(row.token_hash, tokenHash(invite_token)); assert.ok(!JSON.stringify(row).includes(invite_token));
  await assert.rejects(create(x), e => e.code === "INVITE_EXISTS"); assert.equal(await count(f),1);
  const concurrent=await Promise.allSettled([1,2].map(()=>x.invitations.create(x.session.token,x.design.id,x.design.groups[1].id,{expires_at:Date.now()+10000})));
  assert.equal(concurrent.filter(r=>r.status==="fulfilled").length,1);
  assert.equal(concurrent.find(r=>r.status==="rejected").reason.code,"INVITE_EXISTS");
  const other = await studyResearcher(f,s);
  for(const groupId of [x.design.groups[0].id, randomUUID()])
    await assert.rejects(x.invitations.list(other.session.token,x.design.id,groupId), e => e.status === 404);
  for(const staff of [s, await verifiedStaff(f,"administrator")])
    await assert.rejects(x.invitations.create(staff.session.token,x.design.id,x.design.groups[0].id,{expires_at:Date.now()+86400000}), e => e.status === 403);
  await assert.rejects(x.invitations.list(f.raw,x.design.id,x.design.groups[0].id), e => e.status === 401);
  assert.equal((await f.admin.query("SELECT count(*)::integer n FROM pedpsy.participants WHERE study_id=$1",[x.design.id])).rows[0].n,0);
  assert.ok(!JSON.stringify((await f.admin.query("SELECT * FROM pedpsy.access_audit_events WHERE resource_id=$1",[x.design.id])).rows).includes(invite_token));
});
scenario("direct tables/private helpers are inaccessible; identity/expiry/scope cannot be edited or deleted",async(f,x)=>{
  const r=await create(x);
  for(const sql of ["SELECT * FROM pedpsy.group_invitations", "DELETE FROM pedpsy.group_invitations", "UPDATE pedpsy.group_invitations SET status='revoked'",
    "SELECT pedpsy.group_invitation_record(gen_random_uuid())", "SELECT pedpsy.lock_group_invitation_owner(gen_random_uuid(),gen_random_uuid())"])
    await assert.rejects(f.runtime.query(sql), e=>e.code==="42501");
  for(const sql of ["DELETE FROM pedpsy.group_invitations WHERE id=$1", "UPDATE pedpsy.group_invitations SET group_id=gen_random_uuid() WHERE id=$1",
    "UPDATE pedpsy.group_invitations SET expires_at_ms=expires_at_ms+1 WHERE id=$1", "UPDATE pedpsy.group_invitations SET token_hash='sha256:'||repeat('0',64) WHERE id=$1"])
    await assert.rejects(f.admin.query(sql,[r.id]), e=>e.code==="23514");
  assert.equal(await count(f),1);
  const invalidScope=f.seed.studies[1].groups[0].id;
  await assert.rejects(f.admin.query("INSERT INTO pedpsy.group_invitations(id,study_id,group_id,token_hash,created_by,created_at_ms,expires_at_ms) VALUES(gen_random_uuid(),$1,$2,$3,$4,100,200)",
    [x.design.id, invalidScope, tokenHash(randomBytes(32).toString("base64url")), x.row.id]), e=>e.code==="23503");
});
scenario("CAS revoke races, idempotent current revision, close does not erase former invitations or enrollments",async(f,x)=>{
  const r=await create(x), results=await Promise.allSettled([revoke(x,r),revoke(x,r)]);
  assert.equal(results.filter(r=>r.status==="fulfilled").length,1);
  assert.equal(results.find(r=>r.status==="rejected").reason.code,"INVITE_CONFLICT");
  const winner=results.find(r=>r.status==="fulfilled").value;
  assert.deepEqual(await revoke(x,winner),winner);
  const next=await create(x); assert.notEqual(next.id,r.id); assert.notEqual(next.invite_token,r.invite_token);
  await x.studies.lifecycle(x.session.token,x.design.id,{status:"closed",expected_version:x.design.version});
  await assert.rejects(create(x),e=>e.status===404);
  assert.equal((await revoke(x,next)).status,"revoked");
  assert.equal((await x.invitations.list(x.session.token,x.design.id,x.design.groups[0].id)).length,2);
  assert.equal((await f.admin.query("SELECT count(*)::integer n FROM pedpsy.stage_enrollments")).rows[0].n,18);
});
scenario("expiry is bounded by server clock, exhausted old invitation is explicitly revoked, design remains frozen",async(f,x)=>{
  for(const expiry of [Date.now()-1,Date.now()+2592100000,Number.MAX_SAFE_INTEGER])
    await assert.rejects(x.invitations.create(x.session.token,x.design.id,x.design.groups[0].id,{expires_at:expiry}),e=>e.code==="INVALID_REGISTRATION_INPUT");
  const oldId=randomUUID(),at=Date.now()-10000;
  await f.admin.query("INSERT INTO pedpsy.group_invitations(id,study_id,group_id,token_hash,created_by,created_at_ms,expires_at_ms) VALUES($1,$2,$3,$4,$5,$6,$7)",
    [oldId,x.design.id,x.design.groups[0].id,tokenHash(randomBytes(32).toString("base64url")),x.row.id,at,at+1000]);
  const r=await create(x), rows=await x.invitations.list(x.session.token,x.design.id,x.design.groups[0].id);
  assert.equal(rows.find(x=>x.id===oldId).status,"revoked");assert.equal(rows.find(x=>x.id===oldId).revision,1);assert.equal(rows.find(x=>x.id===r.id).status,"active");
  assert.equal((await x.studies.read(x.session.token,x.design.id)).version,x.design.version);
  assert.equal((await f.admin.query("SELECT count(*)::integer n FROM pedpsy.access_audit_events WHERE resource_id=$1 AND action='participants.invites.expire'",[x.design.id])).rows[0].n,1);
});
scenario("mandatory audit failure rolls back invite creation and revoke",async(f,x)=>{
  const r=await create(x);
  await f.admin.query("CREATE FUNCTION pedpsy.synthetic_invite_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action LIKE 'participants.invites.%' THEN RAISE EXCEPTION 'synthetic audit failure'; END IF; RETURN NEW; END $$;CREATE TRIGGER synthetic_invite_audit_failure BEFORE INSERT ON pedpsy.access_audit_events FOR EACH ROW EXECUTE FUNCTION pedpsy.synthetic_invite_audit_failure()");
  await assert.rejects(revoke(x,r),/synthetic audit failure/);
  await assert.rejects(x.invitations.create(x.session.token,x.design.id,x.design.groups[1].id,{expires_at:Date.now()+10000}),/synthetic audit failure/);
  const row=(await f.admin.query("SELECT status,revision FROM pedpsy.group_invitations WHERE id=$1",[r.id])).rows[0];
  assert.deepEqual(row,{status:"active",revision:0}); assert.equal(await count(f),1);
});
async function waitForCreate(f) {
  const deadline=Date.now()+2000;
  while(Date.now()<deadline){if((await f.admin.query("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=$1 AND wait_event_type='Lock' AND query LIKE '%create_group_invitation%') waiting",[f.database])).rows[0].waiting)return;
    await new Promise(r=>setTimeout(r,10));} assert.fail("invitation did not reach lock wait");
}
scenario("revocation committed during credential lock wait blocks creation and allow audit",async(f,x)=>{
  const owner=await f.admin.connect();let pending;
  try{await owner.query("BEGIN");await owner.query("SELECT id FROM pedpsy.researcher_credentials WHERE id=$1 FOR UPDATE",[x.row.id]);
    pending=create(x).then(value=>({value}),error=>({error}));await waitForCreate(f);
    await owner.query("UPDATE pedpsy.researcher_credentials SET status='revoked',version=version+1 WHERE id=$1",[x.row.id]);await owner.query("COMMIT");
    assert.equal((await pending).error?.status,401);
  }finally{await owner.query("ROLLBACK");owner.release();if(pending)await pending;}
  assert.equal(await count(f),0);
  assert.equal((await f.admin.query("SELECT count(*)::integer n FROM pedpsy.access_audit_events WHERE resource_id=$1 AND action='participants.invites.create'",[x.design.id])).rows[0].n,0);
});
scenario("study closure and membership removal while waiting are rechecked under current scope locks",async(f,x)=>{
  for(const mutation of ["membership","closure"]){
    const owner=await f.admin.connect();let pending;
    try{await owner.query("BEGIN");await owner.query("SELECT id FROM pedpsy.studies WHERE id=$1 FOR UPDATE",[x.design.id]);
      pending=create(x).then(value=>({value}),error=>({error}));await waitForCreate(f);
      if(mutation==="membership")await owner.query("UPDATE pedpsy.study_memberships SET status='revoked' WHERE study_id=$1 AND user_id=$2",[x.design.id,x.row.user_id]);
      else await owner.query("UPDATE pedpsy.studies SET status='closed' WHERE id=$1",[x.design.id]);
      await owner.query("COMMIT");assert.equal((await pending).error?.status,404);
    }finally{await owner.query("ROLLBACK");owner.release();if(pending)await pending;}
    if(mutation==="membership")await f.admin.query("UPDATE pedpsy.study_memberships SET status='active' WHERE study_id=$1 AND user_id=$2",[x.design.id,x.row.user_id]);
  } assert.equal(await count(f),0);
});
scenario("persistent issuance throttle survives adapter recreation and does not disable revoke",async(f,x)=>{
  for(let i=0;i<10;i++)await revoke(x,await create(x));
  const {PostgresGroupInvitations}=require("../dist/src/adapters/postgres/group-invitations.js");
  await assert.rejects(new PostgresGroupInvitations(f.runtime).create(x.session.token,x.design.id,x.design.groups[0].id,{expires_at:Date.now()+10000}),e=>e.status===429&&e.code==="INVITE_THROTTLED");
  assert.equal(await count(f),10);assert.equal((await x.invitations.list(x.session.token,x.design.id,x.design.groups[0].id)).length,10);
});
scenario("100-item history and saturated revision are rejected explicitly, never truncated or overflowed",async(f,x)=>{
  const at=Date.now()-2000000,id=randomUUID();
  await f.admin.query("INSERT INTO pedpsy.group_invitations(id,study_id,group_id,token_hash,created_by,created_at_ms,expires_at_ms,revision) VALUES($1,$2,$3,$4,$5,$6,$7,2147483646)",
    [id,x.design.id,x.design.groups[0].id,tokenHash(randomBytes(32).toString("base64url")),x.row.id,at,Date.now()+100000]);
  await assert.rejects(revoke(x,{id,revision:2147483646}),e=>e.status===413&&e.code==="INVITE_LIMIT");
  await f.admin.query("INSERT INTO pedpsy.group_invitations(id,study_id,group_id,token_hash,created_by,created_at_ms,expires_at_ms,status,revision,revoked_at_ms) SELECT gen_random_uuid(),$1,$2,'sha256:'||md5(gen_random_uuid()::text)||md5(gen_random_uuid()::text),$3,$4,$4+1000,'revoked',1,$4+500 FROM generate_series(1,99)",
    [x.design.id,x.design.groups[0].id,x.row.id,at]);
  assert.equal((await x.invitations.list(x.session.token,x.design.id,x.design.groups[0].id)).length,100);
  await assert.rejects(create(x),e=>e.status===413&&e.code==="INVITE_LIMIT");
  await f.admin.query("INSERT INTO pedpsy.group_invitations(id,study_id,group_id,token_hash,created_by,created_at_ms,expires_at_ms,status,revision,revoked_at_ms) VALUES(gen_random_uuid(),$1,$2,$3,$4,$5,$5+1000,'revoked',1,$5+500)",
    [x.design.id,x.design.groups[0].id,tokenHash(randomBytes(32).toString("base64url")),x.row.id,at]);
  await assert.rejects(x.invitations.list(x.session.token,x.design.id,x.design.groups[0].id),e=>e.status===413&&e.code==="INVITE_LIMIT");
});
