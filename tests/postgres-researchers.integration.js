"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict"),{randomBytes,randomUUID}=require("node:crypto");
const {postgresFixture}=require("./postgres-fixture.js"),{verifiedStaff}=require("./mfa-fixture.js"),{sha256}=require("../storage/database.js");
const {PostgresResearcherManagement,PostgresResearcherGateway}=require("../dist/src/adapters/postgres/researchers.js"),{PostgresAccountAccess}=require("../dist/src/adapters/postgres/account-access.js");
const password=()=>randomBytes(24).toString("base64url");
function scenario(name,fn){test("PostgreSQL researchers: "+name,async t=>{const f=await postgresFixture({runtimePoolSize:2});t.after(()=>f.close());await fn(f);});}
async function accepted(f,staff){const m=new PostgresResearcherManagement(f.runtime),g=new PostgresResearcherGateway(f.runtime),invite=await m.invite(staff.session.token),pw=password();
  const accepted=await g.accept({invite_code:invite.invite_code,password:pw});assert.equal(accepted.login_id,invite.login_id);const session=await g.login({login_id:invite.login_id,password:pw});const row=(await m.list(staff.session.token)).find(x=>x.login_id===invite.login_id);return {m,g,invite,pw,session,row};}
scenario("both MFA staff roles invite/accept/login/block with durable default quota",async f=>{
  for(const role of ["administrator","superadministrator"]){const staff=await verifiedStaff(f,role),x=await accepted(f,staff);
    assert.equal(x.row.status,"active");assert.equal(x.row.active_study_quota,1);assert.equal((await new PostgresAccountAccess(f.runtime).session(x.session.token)).role,"researcher");
    assert.deepEqual(await x.g.home(x.session.token),{login_id:x.row.login_id,active_study_quota:1,studies:[]});
    await assert.rejects(x.g.accept({invite_code:x.invite.invite_code,password:password()}),e=>e.code==="INVALID_INVITE");
    const before=(await f.admin.query("SELECT count(*)::integer n FROM pedpsy.attempts")).rows[0].n;
    await x.m.block(staff.session.token,x.row.id);await assert.rejects(x.g.home(x.session.token),e=>e.status===401);await assert.rejects(x.g.login({login_id:x.invite.login_id,password:x.pw}),e=>e.code==="INVALID_LOGIN");
    assert.equal((await f.admin.query("SELECT count(*)::integer n FROM pedpsy.attempts")).rows[0].n,before);
  }
});
scenario("researcher sees only current own study metadata, no diagnostic/global access",async f=>{
  const s=await verifiedStaff(f),x=await accepted(f,s);await f.admin.query("INSERT INTO pedpsy.study_memberships(study_id,user_id,role) VALUES($1,$2,'researcher')",[f.studyId,x.row.user_id]);
  const home=await x.g.home(x.session.token);assert.equal(home.studies.length,1);assert.equal(home.studies[0].id,f.studyId);
  await assert.rejects(x.m.list(x.session.token),e=>e.status===401);await assert.rejects(x.m.invite(x.session.token),e=>e.status===401);await assert.rejects(x.g.home(s.session.token),e=>e.status===401);
  await f.withSession(async c=>assert.equal((await c.query("SELECT * FROM pedpsy.attempt_results")).rowCount,0),sha256(x.session.token));
  await f.admin.query("UPDATE pedpsy.study_memberships SET status='revoked' WHERE user_id=$1",[x.row.user_id]);assert.equal((await x.g.home(x.session.token)).studies.length,0);
  await assert.rejects(x.m.block(s.session.token,randomUUID()),e=>e.status===404);
});
scenario("invite expiry/block/unknown and forged input cannot activate or escalate",async f=>{
  const s=await verifiedStaff(f),m=new PostgresResearcherManagement(f.runtime),g=new PostgresResearcherGateway(f.runtime),i=await m.invite(s.session.token),pw=password();
  await assert.rejects(g.accept({invite_code:i.invite_code,password:pw,role:"superadministrator"}),e=>e.status===400);
  await f.admin.query("UPDATE pedpsy.researcher_invites SET created_at_ms=created_at_ms-90000000,expires_at_ms=expires_at_ms-90000000 WHERE token_hash=$1",[sha256(i.invite_code)]);
  await assert.rejects(g.accept({invite_code:i.invite_code,password:pw}),e=>e.code==="INVALID_INVITE");
  await assert.rejects(g.accept({invite_code:randomBytes(32).toString("base64url"),password:pw}),e=>e.code==="INVALID_INVITE");
  const i2=await m.invite(s.session.token),row=(await m.list(s.session.token)).find(r=>r.login_id===i2.login_id);await m.block(s.session.token,row.id);await assert.rejects(g.accept({invite_code:i2.invite_code,password:pw}),e=>e.code==="INVALID_INVITE");
  for(const table of ["researcher_invites","researcher_credentials","researcher_sessions"])await assert.rejects(f.runtime.query("SELECT * FROM pedpsy."+table),e=>e.code==="42501");
});
scenario("invite controls require fresh MFA and have durable admission limit",async f=>{
  const s=await verifiedStaff(f),m=new PostgresResearcherManagement(f.runtime);for(let i=0;i<5;i++)await m.invite(s.session.token);await assert.rejects(m.invite(s.session.token),e=>e.code==="INVITE_THROTTLED");
  await f.admin.query("UPDATE pedpsy.staff_sessions SET created_at_ms=created_at_ms-360000,mfa_verified_at=mfa_verified_at-interval '6 minutes' WHERE token_hash=$1",[sha256(s.session.token)]);
  await m.list(s.session.token);await assert.rejects(m.invite(s.session.token),e=>e.code==="MFA_RECHECK_REQUIRED");
});
scenario("concurrent accept gives one success; relogin/logout rotate/revoke",async f=>{
  const s=await verifiedStaff(f),m=new PostgresResearcherManagement(f.runtime),i=await m.invite(s.session.token),pw=password();
  const r=await Promise.allSettled([new PostgresResearcherGateway(f.runtime).accept({invite_code:i.invite_code,password:pw}),new PostgresResearcherGateway(f.runtime).accept({invite_code:i.invite_code,password:pw})]);assert.equal(r.filter(x=>x.status==="fulfilled").length,1);
  const g=new PostgresResearcherGateway(f.runtime),one=await g.login({login_id:i.login_id,password:pw}),two=await g.login({login_id:i.login_id,password:pw});await assert.rejects(g.home(one.token),e=>e.status===401);
  await assert.rejects(g.logout(two.token,"fake"),e=>e.status===403);await g.logout(two.token,two.csrf);await assert.rejects(g.home(two.token),e=>e.status===401);
});
scenario("audit failure rolls back invite creation, accept consumption and blocking",async f=>{
  const s=await verifiedStaff(f),x=await accepted(f,s),i=await x.m.invite(s.session.token),count=(await x.m.list(s.session.token)).length;
  await f.admin.query("CREATE FUNCTION pedpsy.synthetic_researcher_audit_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic audit failure'; END $$;CREATE TRIGGER synthetic_researcher_audit_fail BEFORE INSERT ON pedpsy.access_audit_events FOR EACH ROW EXECUTE FUNCTION pedpsy.synthetic_researcher_audit_fail()");
  await assert.rejects(x.m.invite(s.session.token),/synthetic audit failure/);await assert.rejects(x.g.accept({invite_code:i.invite_code,password:password()}),/synthetic audit failure/);await assert.rejects(x.m.block(s.session.token,x.row.id),/synthetic audit failure/);
  assert.equal((await f.admin.query("SELECT count(*)::integer n FROM pedpsy.researcher_credentials")).rows[0].n,count);assert.equal((await f.admin.query("SELECT used_at_ms FROM pedpsy.researcher_invites WHERE token_hash=$1",[sha256(i.invite_code)])).rows[0].used_at_ms,null);
  await f.admin.query("DROP TRIGGER synthetic_researcher_audit_fail ON pedpsy.access_audit_events;DROP FUNCTION pedpsy.synthetic_researcher_audit_fail()");await x.g.home(x.session.token);
});
scenario("block during password derivation prevents issuing researcher session",async f=>{
  const s=await verifiedStaff(f),x=await accepted(f,s),{derive}=require("../storage/access.js");let enter,resume;const entered=new Promise(r=>enter=r),gate=new Promise(r=>resume=r);
  const g=new PostgresResearcherGateway(f.runtime,async(...a)=>{enter();await gate;return derive(...a);}),p=g.login({login_id:x.invite.login_id,password:x.pw});await entered;await x.m.block(s.session.token,x.row.id);resume();await assert.rejects(p,e=>e.code==="INVALID_LOGIN");
});
