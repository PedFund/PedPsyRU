"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict"),{randomBytes}=require("node:crypto");
const {postgresFixture}=require("./postgres-fixture.js"),{workspaceFixture,staffHttp,cookie,headers}=require("./workspace-fixture.js"),{participantService}=require("./participation-fixture.js");
function scenario(name,fn){test("PostgreSQL workspace: "+name,async t=>{const f=await postgresFixture({runtimePoolSize:2}),w=workspaceFixture(f);t.after(async()=>{await w.app.close();await f.close();});await fn(f,w);});}
scenario("real password/MFA HTTP, cookie separation and global stored protocols for both staff roles",async(f,w)=>{
  const p=await participantService(f),stored=await p.complete();for(const role of ["administrator","superadministrator"]){const s=await staffHttp(f,w,role);
    assert.match(s.passwordResponse.headers["set-cookie"],/HttpOnly; SameSite=Strict/);assert.ok(!s.passwordResponse.body.includes(s.pending.split("=")[1]));assert.equal((await w.app.inject({url:"/api/v2/staff/session",headers:{...headers,cookie:s.pending.replace("pending","staff")}})).statusCode,401);
    const session=await w.app.inject({url:"/api/v2/staff/session",headers:s.headers});assert.equal(session.statusCode,200);assert.equal(session.json().role,role);assert.equal(session.json().permissions.includes("staff.roles.assign"),role==="superadministrator");assert.ok(!session.body.includes("token"));
    const list=await w.app.inject({url:"/api/v2/staff/protocols",headers:s.headers});assert.equal(list.json().length,18);
    const protocol=await w.app.inject({url:"/api/v2/staff/protocols/"+p.id,headers:s.headers});assert.equal(protocol.json().responses.length,30);assert.equal(protocol.json().result.id,stored.id);
    const exported=await w.app.inject({method:"POST",url:"/api/v2/staff/export",headers:s.headers,payload:{}});assert.equal(exported.statusCode,200);assert.equal(exported.json().record_count,18);assert.match(exported.headers["content-disposition"],/pedpsy-protocols.json/);
    for(const privateField of ["secret_envelope","salt","password_hash","token_hash","source_text","form_snapshot","key_digest"])assert.ok(!exported.body.includes('"'+privateField+'"'));
    assert.equal((await w.app.inject({method:"POST",url:"/api/v2/staff/logout",headers:s.headers,payload:{}})).statusCode,200);assert.equal((await w.app.inject({url:"/api/v2/staff/session",headers:s.headers})).statusCode,401);
  }
  assert.equal((await f.admin.query("SELECT count(*)::integer n FROM pedpsy.attempt_results")).rows[0].n,1);
});
scenario("invite/accept/researcher own metadata, no private answers, block and audited denial",async(f,w)=>{
  const s=await staffHttp(f,w,"administrator"),i=(await w.app.inject({method:"POST",url:"/api/v2/staff/researchers/invite",headers:s.headers,payload:{}})).json(),password=randomBytes(24).toString("base64url");
  const accepted=await w.app.inject({method:"POST",url:"/api/v2/researcher/accept",headers,payload:{invite_code:i.invite_code,password}});assert.equal(accepted.statusCode,200);assert.equal(accepted.json().login_id,i.login_id);
  const login=await w.app.inject({method:"POST",url:"/api/v2/researcher/login",headers,payload:{login_id:i.login_id,password}});assert.equal(login.statusCode,200);const rh={...headers,cookie:cookie(login,"pedpsy_researcher_demo"),"x-pedpsy-csrf":login.json().csrf};
  const r=(await f.admin.query("SELECT id,user_id FROM pedpsy.researcher_credentials WHERE login_id=$1",[i.login_id])).rows[0];await f.admin.query("INSERT INTO pedpsy.study_memberships(study_id,user_id,role) VALUES($1,$2,'researcher')",[f.studyId,r.user_id]);
  const home=await w.app.inject({url:"/api/v2/researcher/session",headers:rh});assert.equal(home.statusCode,200);assert.equal(home.json().home.studies.length,1);assert.equal(home.json().home.studies[0].id,f.studyId);assert.ok(!home.body.includes("responses"));assert.ok(!home.body.includes("measures"));
  const wrong={...rh,cookie:rh.cookie.replace("researcher","staff")};assert.equal((await w.app.inject({url:"/api/v2/staff/protocols",headers:wrong})).statusCode,401);assert.equal((await w.app.inject({method:"POST",url:"/api/v2/staff/export",headers:wrong,payload:{}})).statusCode,401);
  assert.equal((await w.app.inject({method:"POST",url:"/api/v2/staff/accounts/role",headers:s.headers,payload:{user_id:r.user_id,role:"superadministrator"}})).statusCode,403);
  assert.equal((await w.app.inject({method:"POST",url:"/api/v2/staff/researchers/"+r.id+"/block",headers:s.headers,payload:{}})).statusCode,200);assert.equal((await w.app.inject({url:"/api/v2/researcher/session",headers:rh})).statusCode,401);
  assert.ok((await f.admin.query("SELECT count(*)::integer n FROM pedpsy.access_audit_events WHERE action='http_denied'")).rows[0].n>0);assert.equal((await f.admin.query("SELECT count(*)::integer n FROM pedpsy.attempts")).rows[0].n,18);
});
scenario("super-only role change, server-side fresh MFA, CSRF/origin and audit fail closed",async(f,w)=>{
  const s=await staffHttp(f,w),a=await staffHttp(f,w,"administrator");
  assert.equal((await w.app.inject({method:"POST",url:"/api/v2/staff/accounts/role",headers:s.headers,payload:{user_id:a.user,role:"superadministrator"}})).statusCode,200);assert.equal((await w.app.inject({url:"/api/v2/staff/session",headers:a.headers})).statusCode,401);
  for(const h of [{...s.headers,origin:"https://foreign.test"},{...s.headers,"x-pedpsy-csrf":"wrong"}])assert.equal((await w.app.inject({method:"POST",url:"/api/v2/staff/export",headers:h,payload:{}})).statusCode,403);
  const {sha256}=require("../storage/database.js"),raw=s.headers.cookie.split("=")[1];await f.admin.query("UPDATE pedpsy.staff_sessions SET created_at_ms=created_at_ms-360000,mfa_verified_at=mfa_verified_at-interval '6 minutes' WHERE token_hash=$1",[sha256(raw)]);
  assert.equal((await w.app.inject({url:"/api/v2/staff/protocols",headers:s.headers})).statusCode,200);assert.deepEqual((await w.app.inject({method:"POST",url:"/api/v2/staff/export",headers:s.headers,payload:{}})).json(),{error:"MFA_RECHECK_REQUIRED"});
  for(const path of ["methods","processing","sql"])assert.equal((await w.app.inject({method:"POST",url:"/api/v2/staff/"+path,headers:s.headers,payload:{}})).statusCode,404);
  await f.admin.query("CREATE FUNCTION pedpsy.synthetic_http_audit_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'private synthetic SQL detail'; END $$;CREATE TRIGGER synthetic_http_audit_fail BEFORE INSERT ON pedpsy.access_audit_events FOR EACH ROW EXECUTE FUNCTION pedpsy.synthetic_http_audit_fail()");
  const failed=await w.app.inject({url:"/api/v2/staff/protocols",headers:s.headers});assert.equal(failed.statusCode,500);assert.deepEqual(failed.json(),{error:"INTERNAL_ERROR"});
});
