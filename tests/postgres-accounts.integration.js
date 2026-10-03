"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const {randomUUID,randomBytes}=require("node:crypto");
const {sha256}=require("../storage/database.js");
const {postgresFixture}=require("./postgres-fixture.js");
const {PostgresAccountAccess}=require("../dist/src/adapters/postgres/account-access.js");
async function identity(f,role,mfa=true){const user=randomUUID(),id=randomUUID(),raw=randomBytes(32).toString("base64url"),at=Date.now();
  await f.admin.query("INSERT INTO pedpsy.users(id) VALUES($1)",[user]);
  if(role==="researcher"){
    await f.admin.query("INSERT INTO pedpsy.researcher_credentials(id,user_id,login_id,scheme,salt,password_hash) VALUES($1,$2,$3,'scrypt-N131072-r8-p1-dk64',$4,$5)",[id,user,"TEST-"+id.toUpperCase(),randomBytes(16).toString("hex"),randomBytes(64).toString("hex")]);
    await f.admin.query("INSERT INTO pedpsy.researcher_sessions(token_hash,credential_id,user_id,credential_version,created_at_ms,last_seen_at_ms,expires_at_ms) VALUES($1,$2,$3,1,$4,$4,$5)",[sha256(raw),id,user,at,at+1800000]);
    await f.admin.query("INSERT INTO pedpsy.study_memberships(study_id,user_id,role) VALUES($1,$2,'researcher')",[f.studyId,user]);
  }else{
    await f.admin.query("INSERT INTO pedpsy.staff_credentials(id,user_id,login_id,role,scheme,salt,password_hash) VALUES($1,$2,$3,$4,'scrypt-N131072-r8-p1-dk64',$5,$6)",[id,user,"TEST-"+id,role,randomBytes(16).toString("hex"),randomBytes(64).toString("hex")]);
    await f.admin.query("INSERT INTO pedpsy.staff_sessions(token_hash,credential_id,user_id,role,credential_version,created_at_ms,last_seen_at_ms,expires_at_ms,mfa_verified_at) VALUES($1,$2,$3,$4,1,$5,$5,$6,CASE WHEN $7 THEN to_timestamp($5::bigint/1000.0) ELSE NULL END)",[sha256(raw),id,user,role,at,at+1800000,mfa]);
  }return {id,user,raw,at};
}
function scenario(name,fn){test("PostgreSQL accounts: "+name,async t=>{const f=await postgresFixture();t.after(()=>f.close());await fn(f,new PostgresAccountAccess(f.runtime));});}
scenario("researcher identity and own scope; no diagnostic RLS or private credentials",async(f,a)=>{
  const r=await identity(f,"researcher");assert.equal((await a.session(r.raw)).role,"researcher");
  await a.check(r.raw,"studies.read",{studyId:f.studyId});
  for(const study of [f.seed.studies[1].id,randomUUID(),"invalid"])await assert.rejects(a.check(r.raw,"studies.read",{studyId:study}),e=>e.status===404);
  for(const op of ["protocols.read","results.read","results.download","researchers.invite","staff.roles.assign"])await assert.rejects(a.check(r.raw,op),e=>e.status===403);
  await f.withSession(async c=>{assert.equal((await c.query("SELECT * FROM pedpsy.attempts")).rowCount,0);assert.equal((await c.query("SELECT * FROM pedpsy.session_actor()")).rowCount,0);},sha256(r.raw));
  for(const table of ["researcher_credentials","researcher_sessions","staff_credentials"])await assert.rejects(f.runtime.query("SELECT * FROM pedpsy."+table),e=>e.code==="42501");
});
scenario("both verified staff roles are global, admin cannot process/method/appoint",async(f,a)=>{
  for(const role of ["administrator","superadministrator"]){const s=await identity(f,role);assert.equal((await a.session(s.raw)).role,role);
    for(const op of ["protocols.read","protocols.download","results.read","results.download","researchers.invite","researchers.block"])await a.check(s.raw,op,{studyId:f.seed.studies[1].id});
    if(role==="administrator")for(const op of ["methods.manage","processing.manage","staff.roles.assign"])await assert.rejects(a.check(s.raw,op),e=>e.status===403);
    else for(const op of ["methods.manage","processing.manage","staff.roles.assign"])await a.check(s.raw,op);
    await assert.rejects(a.check(s.raw,"studies.configure"),e=>e.status===403);
  }
});
scenario("password-only, participant, unknown or client role labels cannot authorize",async(f,a)=>{
  const s=await identity(f,"administrator",false);
  for(const raw of [s.raw,f.raw,randomBytes(32).toString("base64url"),""])await assert.rejects(a.session(raw),e=>e.status===401);
  await f.withSession(async c=>{await c.query("SELECT set_config('app.role','superadministrator',true),set_config('app.user_id',$1,true)",[s.user]);assert.equal((await c.query("SELECT * FROM pedpsy.account_actor()")).rowCount,0);},f.hash);
});
scenario("membership revocation, account disable and credential version invalidate access",async(f,a)=>{
  const r=await identity(f,"researcher");await a.check(r.raw,"studies.read",{studyId:f.studyId});
  await f.admin.query("UPDATE pedpsy.study_memberships SET status='revoked' WHERE user_id=$1",[r.user]);
  await assert.rejects(a.check(r.raw,"studies.read",{studyId:f.studyId}),e=>e.status===404);
  await f.admin.query("UPDATE pedpsy.researcher_credentials SET version=version+1 WHERE id=$1",[r.id]);
  await assert.rejects(a.session(r.raw),e=>e.status===401);
  const s=await identity(f,"superadministrator");await f.admin.query("UPDATE pedpsy.users SET status='disabled' WHERE id=$1",[s.user]);await assert.rejects(a.session(s.raw),e=>e.status===401);
  await assert.rejects(f.admin.query("UPDATE pedpsy.researcher_credentials SET password_hash=$1 WHERE id=$2",[randomBytes(64).toString("hex"),r.id]),e=>e.code==="23514");
});
scenario("fresh MFA needed for export/control; required audit fails closed",async(f,a)=>{
  const s=await identity(f,"administrator");const old=Date.now()-360000;
  await f.admin.query("UPDATE pedpsy.staff_sessions SET created_at_ms=$1,mfa_verified_at=to_timestamp($1::bigint/1000.0) WHERE credential_id=$2",[old,s.id]);
  await a.check(s.raw,"results.read");await assert.rejects(a.check(s.raw,"results.download"),e=>e.code==="MFA_RECHECK_REQUIRED");
  const logs=(await f.admin.query("SELECT action,outcome,reason FROM pedpsy.access_audit_events WHERE credential_id=$1",[s.id])).rows;
  assert.ok(logs.some(x=>x.action==="results.download"&&x.outcome==="deny"));
  await f.admin.query("CREATE FUNCTION pedpsy.synthetic_account_audit_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic audit failure'; END $$; CREATE TRIGGER synthetic_account_audit_fail BEFORE INSERT ON pedpsy.access_audit_events FOR EACH ROW EXECUTE FUNCTION pedpsy.synthetic_account_audit_fail()");
  await assert.rejects(a.session(s.raw),/synthetic audit failure/);
  assert.equal((await f.runtime.query("SELECT * FROM pedpsy.account_actor()")).rowCount,0);
});
module.exports={identity};
