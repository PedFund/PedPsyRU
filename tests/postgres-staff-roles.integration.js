"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict"),{randomUUID,randomBytes}=require("node:crypto");
const {postgresFixture}=require("./postgres-fixture.js"),{verifiedStaff}=require("./mfa-fixture.js"),{passwordRecord}=require("../storage/access.js"),{sha256}=require("../storage/database.js");
const {PostgresStaffManagement}=require("../dist/src/adapters/postgres/staff-management.js"),{PostgresAccountAccess}=require("../dist/src/adapters/postgres/account-access.js");
const {PostgresResearcherGateway,PostgresResearcherManagement}=require("../dist/src/adapters/postgres/researchers.js"),{PostgresStaffPassword}=require("../dist/src/adapters/postgres/staff-password.js");
function scenario(name,fn){test("PostgreSQL staff roles: "+name,async t=>{const f=await postgresFixture({runtimePoolSize:2});t.after(()=>f.close());await fn(f,new PostgresStaffManagement(f.runtime));});}
scenario("only fresh superadmin assigns; admin/participant/self/invalid DTO denied",async(f,m)=>{
  const a=await verifiedStaff(f,"administrator"),s=await verifiedStaff(f);for(const raw of [a.session.token,f.raw])await assert.rejects(m.assign(raw,{user_id:a.user,role:"superadministrator"}),e=>e.status===401||e.status===403);
  await assert.rejects(m.assign(s.session.token,{user_id:s.user,role:"administrator"}),e=>e.code==="SELF_ROLE_CHANGE_FORBIDDEN");
  await assert.rejects(m.assign(s.session.token,{user_id:a.user,role:"superadministrator",mfa:true}),e=>e.status===400);
  await f.admin.query("UPDATE pedpsy.staff_sessions SET created_at_ms=created_at_ms-360000,mfa_verified_at=mfa_verified_at-interval '6 minutes' WHERE token_hash=$1",[sha256(s.session.token)]);
  await assert.rejects(m.assign(s.session.token,{user_id:a.user,role:"superadministrator"}),e=>e.code==="MFA_RECHECK_REQUIRED");
});
scenario("assignment bumps version/revokes prior sessions and preserves their history",async(f,m)=>{
  const s=await verifiedStaff(f),a=await verifiedStaff(f,"administrator");await m.assign(s.session.token,{user_id:a.user,role:"superadministrator"});
  await assert.rejects(new PostgresAccountAccess(f.runtime).session(a.session.token),e=>e.status===401);
  const old=(await f.admin.query("SELECT role,revoked_at_ms FROM pedpsy.staff_sessions WHERE token_hash=$1",[sha256(a.session.token)])).rows[0];assert.equal(old.role,"superadministrator");assert.notEqual(old.revoked_at_ms,null);
  const p=await a.gateway.password({login_id:a.login,password:a.password}),newSession=await a.gateway.verify(p.challenge,{type:"recovery",code:a.session.recoveryCodes[0]});
  assert.equal((await new PostgresAccountAccess(f.runtime).session(newSession.token)).role,"superadministrator");assert.equal((await m.list(s.session.token)).length,2);
});
scenario("explicit promotion replaces researcher role; password alone still cannot access diagnostics",async(f,m)=>{
  const s=await verifiedStaff(f),rm=new PostgresResearcherManagement(f.runtime),g=new PostgresResearcherGateway(f.runtime),i=await rm.invite(s.session.token),pw=randomBytes(24).toString("base64url");
  await g.accept({invite_code:i.invite_code,password:pw});const session=await g.login({login_id:i.login_id,password:pw}),row=(await rm.list(s.session.token))[0];
  await m.assign(s.session.token,{user_id:row.user_id,role:"administrator"});await assert.rejects(g.home(session.token),e=>e.status===401);
  const p=await new PostgresStaffPassword(f.runtime).password({login_id:i.login_id,password:pw});assert.equal(p.status,"mfa_required");await assert.rejects(new PostgresAccountAccess(f.runtime).session(p.challenge),e=>e.status===401);
  assert.equal((await m.list(s.session.token)).find(x=>x.user_id===row.user_id).role,"administrator");
});
scenario("concurrent reciprocal demotions cannot remove last active superadmin",async(f,m)=>{
  const a=await verifiedStaff(f),b=await verifiedStaff(f);const r=await Promise.allSettled([m.assign(a.session.token,{user_id:b.user,role:"administrator"}),m.assign(b.session.token,{user_id:a.user,role:"administrator"})]);
  assert.equal(r.filter(x=>x.status==="fulfilled").length,1);assert.equal((await f.admin.query("SELECT count(*)::integer n FROM pedpsy.staff_credentials c JOIN pedpsy.users u ON u.id=c.user_id WHERE c.role='superadministrator' AND c.status='active' AND u.status='active'")).rows[0].n,1);
});
scenario("mandatory audit failure rolls back role/version/revocation; offline bootstrap private and one-use",async(f,m)=>{
  const s=await verifiedStaff(f),a=await verifiedStaff(f,"administrator");
  await f.admin.query("CREATE FUNCTION pedpsy.synthetic_role_audit_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic audit failure'; END $$;CREATE TRIGGER synthetic_role_audit_fail BEFORE INSERT ON pedpsy.access_audit_events FOR EACH ROW EXECUTE FUNCTION pedpsy.synthetic_role_audit_fail()");
  await assert.rejects(m.assign(s.session.token,{user_id:a.user,role:"superadministrator"}),/synthetic audit failure/);await f.admin.query("DROP TRIGGER synthetic_role_audit_fail ON pedpsy.access_audit_events;DROP FUNCTION pedpsy.synthetic_role_audit_fail()");
  assert.equal((await new PostgresAccountAccess(f.runtime).session(a.session.token)).role,"administrator");assert.equal((await f.admin.query("SELECT version FROM pedpsy.staff_credentials WHERE id=$1",[a.id])).rows[0].version,1);
  await assert.rejects(f.runtime.query("SELECT pedpsy.bootstrap_first_superadmin($1,$2,$3,$4,$5)",[randomUUID(),randomUUID(),"SYNTHETIC-FIRST",randomBytes(16).toString("hex"),randomBytes(64).toString("hex")]),e=>e.code==="42501");
});
test("PostgreSQL staff roles: actual owner-only first synthetic bootstrap then password pending MFA",async t=>{
  const f=await postgresFixture();t.after(()=>f.close());const p=await passwordRecord(randomBytes(24).toString("base64url")),id=randomUUID(),user=randomUUID();
  const values=[id,user,"SYNTHETIC-FIRST",p.salt,p.password_hash];await f.admin.query("SELECT pedpsy.bootstrap_first_superadmin($1,$2,$3,$4,$5)",values);
  await assert.rejects(f.admin.query("SELECT pedpsy.bootstrap_first_superadmin($1,$2,$3,$4,$5)",[randomUUID(),randomUUID(),"SYNTHETIC-SECOND",p.salt,p.password_hash]),e=>e.code==="23514");
  assert.equal((await f.admin.query("SELECT role FROM pedpsy.staff_credentials WHERE id=$1",[id])).rows[0].role,"superadministrator");assert.equal((await f.admin.query("SELECT * FROM pedpsy.staff_sessions")).rowCount,0);
});
