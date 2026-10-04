"use strict";
const {test} = require("node:test"), assert = require("node:assert/strict"), {randomUUID} = require("node:crypto");
const {postgresFixture} = require("./postgres-fixture.js"), {workspaceFixture, headers} = require("./workspace-fixture.js");
const {verifiedStaff} = require("./mfa-fixture.js"), {invitationResearcher} = require("./group-invitation-fixture.js"), {studyResearcher} = require("./study-fixture.js");
const {csrfFor} = require("../storage/access.js");
function scenario(name, fn) {test("PostgreSQL group invite HTTP: " + name, async t => {
  const f=await postgresFixture({runtimePoolSize:2}),w=workspaceFixture(f);
  t.after(async()=>{await w.app.close();await f.close();});
  const s=await verifiedStaff(f),x=await invitationResearcher(f,s);
  const h={...headers,cookie:"pedpsy_researcher_demo="+x.session.token,"x-pedpsy-csrf":csrfFor(x.session.token)};
  const path="/api/v2/researcher/studies/"+x.design.id+"/groups/"+x.design.groups[0].id+"/invitations";
  await fn(f,w,x,s,h,path);
});}
scenario("authenticated group link CRUD persists, token returned once and no enrollment is created",async(f,w,x,s,h,path)=>{
  const issued=await w.app.inject({method:"POST",url:path,headers:h,payload:{expires_at:Date.now()+86400000}});
  assert.equal(issued.statusCode,200);const r=issued.json();assert.match(r.invite_token,/^[A-Za-z0-9_-]{43}$/);
  assert.equal((await w.app.inject({method:"POST",url:path,headers:h,payload:{expires_at:Date.now()+86400000}})).statusCode,409);
  const listed=await w.app.inject({url:path,headers:h});assert.equal(listed.statusCode,200);
  const {invite_token,...record}=r;assert.deepEqual(listed.json(),[record]);
  for(const field of ["invite_token","token_hash","password_hash","email","responses","measures"])assert.ok(!listed.body.includes(field));
  const removed=await w.app.inject({method:"POST",url:path+"/"+r.id+"/revoke",headers:h,payload:{expected_revision:0}});
  assert.equal(removed.statusCode,200);assert.equal(removed.json().revision,1);assert.equal(removed.json().status,"revoked");assert.ok(!removed.body.includes(invite_token));
  assert.equal((await w.app.inject({method:"POST",url:path+"/"+r.id+"/revoke",headers:h,payload:{expected_revision:0}})).statusCode,409);
  assert.equal((await f.admin.query("SELECT count(*)::integer n FROM pedpsy.participants WHERE study_id=$1",[x.design.id])).rows[0].n,0);
  assert.equal((await f.admin.query("SELECT count(*)::integer n FROM pedpsy.attempts")).rows[0].n,18);
  // Participant-facing /join is a later UI block, not silently opened by CRUD.
  assert.equal((await w.app.inject({url:"/join",headers})).statusCode,404);
});
scenario("same-origin, CSRF, realm, exact DTO and foreign group protections never leak state",async(f,w,x,s,h,path)=>{
  for(const extra of [{role:"superadministrator"},{group_id:randomUUID()},{invite_token:"i".repeat(43)}])
    assert.equal((await w.app.inject({method:"POST",url:path,headers:h,payload:{expires_at:Date.now()+86400000,...extra}})).statusCode,400);
  for(const changed of [{...h,origin:"https://other.test"},{...h,"x-pedpsy-csrf":"bad"},{...h,cookie:h.cookie+"; "+h.cookie}])
    assert.equal((await w.app.inject({method:"POST",url:path,headers:changed,payload:{expires_at:Date.now()+86400000}})).statusCode,403);
  const stranger=await studyResearcher(f,s),foreign={...h,cookie:"pedpsy_researcher_demo="+stranger.session.token,"x-pedpsy-csrf":csrfFor(stranger.session.token)};
  for(const url of [path,path.replace(x.design.id,randomUUID()),path.replace(x.design.groups[0].id,f.seed.studies[1].groups[0].id)]){
    const r=await w.app.inject({url,headers:foreign});assert.equal(r.statusCode,404);assert.deepEqual(r.json(),{error:"NOT_AVAILABLE"});
  }
  for(const role of ["administrator","superadministrator"]){const staff=role===s.role?s:await verifiedStaff(f,role);
    const staffHeaders={...h,cookie:"pedpsy_researcher_demo="+staff.session.token,"x-pedpsy-csrf":csrfFor(staff.session.token)};
    assert.equal((await w.app.inject({method:"POST",url:path,headers:staffHeaders,payload:{expires_at:Date.now()+86400000}})).statusCode,401);
  }
  assert.equal((await w.app.inject({url:path,headers})).statusCode,401);
  assert.equal((await f.admin.query("SELECT count(*)::integer n FROM pedpsy.group_invitations")).rows[0].n,0);
});
scenario("audit failure is a neutral 500 and the generated link is not committed or returned",async(f,w,x,s,h,path)=>{
  await f.admin.query("CREATE FUNCTION pedpsy.synthetic_group_http_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action LIKE 'participants.invites.%' THEN RAISE EXCEPTION 'private SQL diagnostic'; END IF; RETURN NEW; END $$;CREATE TRIGGER synthetic_group_http_audit_failure BEFORE INSERT ON pedpsy.access_audit_events FOR EACH ROW EXECUTE FUNCTION pedpsy.synthetic_group_http_audit_failure()");
  const failed=await w.app.inject({method:"POST",url:path,headers:h,payload:{expires_at:Date.now()+86400000}});
  assert.equal(failed.statusCode,500);assert.deepEqual(failed.json(),{error:"INTERNAL_ERROR"});
  assert.equal((await f.admin.query("SELECT count(*)::integer n FROM pedpsy.group_invitations")).rows[0].n,0);
});
