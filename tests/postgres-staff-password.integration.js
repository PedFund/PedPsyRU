"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict");
const {randomBytes}=require("node:crypto");
const {sha256}=require("../storage/database.js");
const {derive}=require("../storage/access.js");
const {postgresFixture}=require("./postgres-fixture.js"),{staffFixture}=require("./staff-fixture.js");
const {PostgresStaffPassword}=require("../dist/src/adapters/postgres/staff-password.js");
const {PostgresAccountAccess}=require("../dist/src/adapters/postgres/account-access.js");
function scenario(name,fn){test("PostgreSQL staff password: "+name,async t=>{const f=await postgresFixture();t.after(()=>f.close());await fn(f);});}
const start=(g,s)=>g.password({login_id:s.login,password:s.password});
scenario("both roles receive only hashed pending MFA, never a staff/participant session",async f=>{
  for(const role of ["administrator","superadministrator"]){const s=await staffFixture(f,role),p=await start(new PostgresStaffPassword(f.runtime),s);
    assert.equal(p.status,"mfa_required");assert.match(p.challenge,/^[A-Za-z0-9_-]{43}$/);
    assert.ok(p.expiresAt>Date.now()&&p.expiresAt<=Date.now()+300000);
    const c=(await f.admin.query("SELECT * FROM pedpsy.staff_login_challenges WHERE credential_id=$1",[s.id])).rows[0];
    assert.equal(c.token_hash,sha256(p.challenge));assert.equal(c.credential_version,1);
    assert.equal((await f.admin.query("SELECT * FROM pedpsy.staff_sessions WHERE credential_id=$1",[s.id])).rowCount,0);
    await assert.rejects(new PostgresAccountAccess(f.runtime).session(p.challenge),e=>e.status===401);
    await f.withSession(async q=>{assert.equal((await q.query("SELECT * FROM pedpsy.session_actor()")).rowCount,0);assert.equal((await q.query("SELECT * FROM pedpsy.attempts")).rowCount,0);},sha256(p.challenge));
    const audit=JSON.stringify((await f.admin.query("SELECT * FROM pedpsy.access_audit_events WHERE credential_id=$1",[s.id])).rows);assert.ok(!audit.includes(s.password)&&!audit.includes(p.challenge)&&!audit.includes(s.login));
  }
  await assert.rejects(f.runtime.query("SELECT * FROM pedpsy.staff_login_challenges"),e=>e.code==="42501");
});
scenario("wrong/unknown/revoked response and persistent throttle survive gateway recreation",async f=>{
  const s=await staffFixture(f);
  for(const login of [s.login,"SYNTHETIC-UNKNOWN"])await assert.rejects(new PostgresStaffPassword(f.runtime).password({login_id:login,password:"wrong-synthetic-password"}),e=>e.status===401&&e.code==="INVALID_LOGIN");
  await f.admin.query("UPDATE pedpsy.staff_credentials SET status='revoked',version=version+1 WHERE id=$1",[s.id]);
  await assert.rejects(start(new PostgresStaffPassword(f.runtime),s),e=>e.status===401&&e.code==="INVALID_LOGIN");
  for(let i=0;i<3;i++)await assert.rejects(start(new PostgresStaffPassword(f.runtime),s),e=>e.status===401);
  await assert.rejects(start(new PostgresStaffPassword(f.runtime),s),e=>e.status===429);
});
scenario("new password login rotates challenge; expiration/disable/version are current",async f=>{
  const s=await staffFixture(f),g=new PostgresStaffPassword(f.runtime),p=await start(g,s),p2=await start(g,s);
  const lookup=raw=>f.runtime.query("SELECT * FROM pedpsy.lock_staff_challenge($1)",[sha256(raw)]);
  assert.equal((await lookup(p.challenge)).rowCount,0);assert.equal((await lookup(p2.challenge)).rowCount,1);
  await f.admin.query("UPDATE pedpsy.staff_login_challenges SET created_at_ms=created_at_ms-360000,expires_at_ms=expires_at_ms-360000 WHERE token_hash=$1",[sha256(p2.challenge)]);
  assert.equal((await lookup(p2.challenge)).rowCount,0);
  const p3=await start(g,s);await f.admin.query("UPDATE pedpsy.users SET status='disabled' WHERE id=$1",[s.user]);assert.equal((await lookup(p3.challenge)).rowCount,0);
  await f.admin.query("UPDATE pedpsy.users SET status='active' WHERE id=$1",[s.user]);await f.admin.query("UPDATE pedpsy.staff_credentials SET version=version+1 WHERE id=$1",[s.id]);assert.equal((await lookup(p3.challenge)).rowCount,0);
});
scenario("revoke during password derivation cannot issue challenge",async f=>{
  const s=await staffFixture(f);let enter,resume;const entered=new Promise(r=>enter=r),gate=new Promise(r=>resume=r);
  const g=new PostgresStaffPassword(f.runtime,async(...args)=>{enter();await gate;return derive(...args);});
  const p=start(g,s);await entered;await f.admin.query("UPDATE pedpsy.staff_credentials SET status='revoked',version=version+1 WHERE id=$1",[s.id]);resume();
  await assert.rejects(p,e=>e.status===401);assert.equal((await f.admin.query("SELECT * FROM pedpsy.staff_login_challenges WHERE credential_id=$1",[s.id])).rowCount,0);
});
scenario("reset invalidates existing challenges/sessions, cannot change password without version",async f=>{
  const s=await staffFixture(f),p=await start(new PostgresStaffPassword(f.runtime),s),at=Date.now(),hash=sha256(randomBytes(32).toString("base64url"));
  await f.admin.query("INSERT INTO pedpsy.staff_sessions(token_hash,credential_id,user_id,role,credential_version,created_at_ms,last_seen_at_ms,expires_at_ms) VALUES($1,$2,$3,'superadministrator',1,$4,$4,$5)",[hash,s.id,s.user,at,at+1800000]);
  await assert.rejects(f.admin.query("UPDATE pedpsy.staff_credentials SET password_hash=$1 WHERE id=$2",[randomBytes(64).toString("hex"),s.id]),e=>e.code==="23514");
  await f.admin.query("UPDATE pedpsy.staff_credentials SET password_hash=$1,version=version+1 WHERE id=$2",[randomBytes(64).toString("hex"),s.id]);
  assert.equal((await f.runtime.query("SELECT * FROM pedpsy.lock_staff_challenge($1)",[sha256(p.challenge)])).rowCount,0);
  assert.notEqual((await f.admin.query("SELECT revoked_at_ms FROM pedpsy.staff_sessions WHERE token_hash=$1",[hash])).rows[0].revoked_at_ms,null);
});
scenario("audit failure rolls back challenge rotation/issue",async f=>{
  const s=await staffFixture(f),g=new PostgresStaffPassword(f.runtime),p=await start(g,s);
  await f.admin.query("CREATE FUNCTION pedpsy.synthetic_pending_audit_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic audit failure'; END $$; CREATE TRIGGER synthetic_pending_audit_fail BEFORE INSERT ON pedpsy.access_audit_events FOR EACH ROW EXECUTE FUNCTION pedpsy.synthetic_pending_audit_fail()");
  await assert.rejects(start(g,s),/synthetic audit failure/);
  assert.equal((await f.admin.query("SELECT * FROM pedpsy.staff_login_challenges WHERE credential_id=$1",[s.id])).rowCount,1);
  assert.equal((await f.admin.query("SELECT used_at_ms FROM pedpsy.staff_login_challenges WHERE token_hash=$1",[sha256(p.challenge)])).rows[0].used_at_ms,null);
});
