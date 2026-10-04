"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict"),{randomBytes}=require("node:crypto");
const {sha256}=require("../storage/database.js"),{csrfFor}=require("../storage/access.js");
const {postgresFixture}=require("./postgres-fixture.js"),{staffFixture}=require("./staff-fixture.js");
const {PostgresStaffMfa}=require("../dist/src/adapters/postgres/staff-mfa.js"),{PostgresAccountAccess}=require("../dist/src/adapters/postgres/account-access.js");
const {MfaVault}=require("../dist/src/adapters/security/mfa-vault.js"),{otpAt,base32}=require("../dist/src/adapters/security/totp.js");
function scenario(name,fn){test("PostgreSQL MFA: "+name,async t=>{const f=await postgresFixture({runtimePoolSize:2});t.after(()=>f.close());await fn(f);});}
const login=(g,s)=>g.password({login_id:s.login,password:s.password});
async function setup(f,role="superadministrator"){
  const s=await staffFixture(f,role),vault=new MfaVault(randomBytes(32)),g=new PostgresStaffMfa(f.runtime,vault),p=await login(g,s),shown=await g.enroll(p.challenge);
  const factor=(await f.admin.query("SELECT * FROM pedpsy.staff_mfa_factors WHERE credential_id=$1",[s.id])).rows[0];
  const secret=vault.open(s.id,factor.secret_envelope);assert.equal(shown.secret,base32(secret));
  return {s,g,p,secret,vault};
}
async function confirm(x){return x.g.verify(x.p.challenge,{type:"totp",code:await require("./mfa-fixture.js").previousFixtureCode(x.secret)});}
scenario("actual TOTP enrollment for both roles gives global session only after confirmation",async f=>{
  for(const role of ["administrator","superadministrator"]){const x=await setup(f,role);try{
    await assert.rejects(new PostgresAccountAccess(f.runtime).session(x.p.challenge),e=>e.status===401);
    await assert.rejects(x.g.enroll(x.p.challenge),e=>e.code==="MFA_ENROLLMENT_EXISTS");
    const session=await confirm(x);assert.equal(session.recoveryCodes.length,8);assert.equal(new Set(session.recoveryCodes).size,8);
    assert.equal((await new PostgresAccountAccess(f.runtime).session(session.token)).role,role);assert.equal(session.csrf,csrfFor(session.token));
    await f.withSession(async c=>assert.equal((await c.query("SELECT * FROM pedpsy.attempts")).rowCount,18),sha256(session.token));
    const stored=JSON.stringify((await f.admin.query("SELECT * FROM pedpsy.staff_mfa_factors WHERE credential_id=$1",[x.s.id])).rows);
    assert.ok(!stored.includes(base32(x.secret)));const recovery=JSON.stringify((await f.admin.query("SELECT * FROM pedpsy.staff_recovery_codes WHERE credential_id=$1",[x.s.id])).rows);
    for(const code of session.recoveryCodes)assert.ok(!recovery.includes(code));
    for(const table of ["staff_mfa_factors","staff_recovery_codes"])await assert.rejects(f.runtime.query("SELECT * FROM pedpsy."+table),e=>e.code==="42501");
    await assert.rejects(x.g.verify(x.p.challenge,{type:"totp",code:otpAt(x.secret,Math.floor(Date.now()/30000))}),e=>e.status===401);
  }finally{x.secret.fill(0);}}
});
scenario("same TOTP step cannot log in twice, recovery is one-use and rotates session",async f=>{
  const x=await setup(f);try{const first=await confirm(x),p=await login(x.g,x.s);
    const usedStep=Number((await f.admin.query("SELECT last_step FROM pedpsy.staff_mfa_factors WHERE credential_id=$1",[x.s.id])).rows[0].last_step);
    await assert.rejects(x.g.verify(p.challenge,{type:"totp",code:otpAt(x.secret,usedStep)}),e=>e.status===401);
    const second=await x.g.verify(p.challenge,{type:"recovery",code:first.recoveryCodes[0]});assert.ok(!second.recoveryCodes);
    await assert.rejects(new PostgresAccountAccess(f.runtime).session(first.token),e=>e.status===401);
    const p2=await login(x.g,x.s);await assert.rejects(x.g.verify(p2.challenge,{type:"recovery",code:first.recoveryCodes[0]}),e=>e.status===401);
    assert.equal((await f.admin.query("SELECT count(*)::integer n FROM pedpsy.staff_recovery_codes WHERE credential_id=$1 AND used_at_ms IS NOT NULL",[x.s.id])).rows[0].n,1);
  }finally{x.secret.fill(0);}
});
scenario("five failed TOTP attempts exhaust challenge durably across gateway recreation",async f=>{
  const x=await setup(f);try{let bad="000000";while([-1,0,1].some(i=>otpAt(x.secret,Math.floor(Date.now()/30000)+i)===bad))bad=String(Number(bad)+1).padStart(6,"0");
    for(let i=0;i<5;i++)await assert.rejects(new PostgresStaffMfa(f.runtime,x.vault).verify(x.p.challenge,{type:"totp",code:bad}),e=>e.status===401);
    assert.equal((await f.admin.query("SELECT failed_attempts FROM pedpsy.staff_login_challenges WHERE token_hash=$1",[sha256(x.p.challenge)])).rows[0].failed_attempts,5);
    await assert.rejects(confirm(x),e=>e.status===401);assert.equal((await f.admin.query("SELECT * FROM pedpsy.staff_sessions WHERE credential_id=$1",[x.s.id])).rowCount,0);
  }finally{x.secret.fill(0);}
});
scenario("concurrent confirmation yields one session/recovery set, no replay",async f=>{
  const x=await setup(f);try{const code=await require("./mfa-fixture.js").previousFixtureCode(x.secret),r=await Promise.allSettled([x.g.verify(x.p.challenge,{type:"totp",code}),x.g.verify(x.p.challenge,{type:"totp",code})]);
    assert.equal(r.filter(p=>p.status==="fulfilled").length,1);assert.equal((await f.admin.query("SELECT * FROM pedpsy.staff_sessions WHERE credential_id=$1",[x.s.id])).rowCount,1);
    assert.equal((await f.admin.query("SELECT * FROM pedpsy.staff_recovery_codes WHERE credential_id=$1",[x.s.id])).rowCount,8);
  }finally{x.secret.fill(0);}
});
scenario("expiry and revoke before second factor cannot create session",async f=>{
  const x=await setup(f);try{
    await f.admin.query("UPDATE pedpsy.staff_login_challenges SET created_at_ms=created_at_ms-360000,expires_at_ms=expires_at_ms-360000 WHERE token_hash=$1",[sha256(x.p.challenge)]);await assert.rejects(confirm(x),e=>e.status===401);
    const p=await login(x.g,x.s);await x.g.enroll(p.challenge);await f.admin.query("UPDATE pedpsy.staff_credentials SET status='revoked',version=version+1 WHERE id=$1",[x.s.id]);
    await assert.rejects(x.g.verify(p.challenge,{type:"totp",code:"000000"}),e=>e.status===401);assert.equal((await f.admin.query("SELECT * FROM pedpsy.staff_sessions WHERE credential_id=$1",[x.s.id])).rowCount,0);
  }finally{x.secret.fill(0);}
});
scenario("audit failure rolls back factor confirmation/replay marker/recovery/challenge/session",async f=>{
  const x=await setup(f);try{
    await f.admin.query("CREATE FUNCTION pedpsy.synthetic_mfa_audit_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic audit failure'; END $$; CREATE TRIGGER synthetic_mfa_audit_fail BEFORE INSERT ON pedpsy.access_audit_events FOR EACH ROW EXECUTE FUNCTION pedpsy.synthetic_mfa_audit_fail()");
    await assert.rejects(confirm(x),/synthetic audit failure/);
    const factor=(await f.admin.query("SELECT confirmed_at_ms,last_step FROM pedpsy.staff_mfa_factors WHERE credential_id=$1",[x.s.id])).rows[0];assert.equal(factor.confirmed_at_ms,null);assert.equal(Number(factor.last_step),-1);
    assert.equal((await f.admin.query("SELECT * FROM pedpsy.staff_sessions WHERE credential_id=$1",[x.s.id])).rowCount,0);assert.equal((await f.admin.query("SELECT * FROM pedpsy.staff_recovery_codes WHERE credential_id=$1",[x.s.id])).rowCount,0);
    await f.admin.query("DROP TRIGGER synthetic_mfa_audit_fail ON pedpsy.access_audit_events;DROP FUNCTION pedpsy.synthetic_mfa_audit_fail()");await confirm(x);
  }finally{x.secret.fill(0);}
});
scenario("logout requires CSRF; credential reset invalidates actual MFA session",async f=>{
  const x=await setup(f);try{const session=await confirm(x);await assert.rejects(x.g.logout(session.token,"fake"),e=>e.status===403);
    await x.g.logout(session.token,session.csrf);await assert.rejects(new PostgresAccountAccess(f.runtime).session(session.token),e=>e.status===401);
    const p=await login(x.g,x.s),second=await x.g.verify(p.challenge,{type:"recovery",code:session.recoveryCodes[1]});
    await f.admin.query("UPDATE pedpsy.staff_credentials SET version=version+1 WHERE id=$1",[x.s.id]);await assert.rejects(new PostgresAccountAccess(f.runtime).session(second.token),e=>e.status===401);
  }finally{x.secret.fill(0);}
});
scenario("confirmed factor cannot be replaced by password alone; wrong vault key fails closed",async f=>{
  const x=await setup(f);try{await confirm(x);const p=await login(x.g,x.s);await assert.rejects(x.g.enroll(p.challenge),e=>e.code==="MFA_ALREADY_ENROLLED");
    await assert.rejects(new PostgresStaffMfa(f.runtime,new MfaVault(randomBytes(32))).verify(p.challenge,{type:"totp",code:"000000"}));
    assert.equal((await f.admin.query("SELECT count(*)::integer n FROM pedpsy.staff_sessions WHERE credential_id=$1",[x.s.id])).rows[0].n,1);
  }finally{x.secret.fill(0);}
});
