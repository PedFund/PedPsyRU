"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict"),{randomBytes}=require("node:crypto");
const {postgresFixture}=require("./postgres-fixture.js"),{verifiedStaff}=require("./mfa-fixture.js"),{invitationResearcher}=require("./group-invitation-fixture.js");
const {workspaceFixture,staffHttp,cookie,headers,origin}=require("./workspace-fixture.js");
const body={email:"Server.HTTP.Owner@example.test",password:"synthetic server HTTP password",contact_notice_version:"demo-contact-1",accept_contact_notice:true};
function scenario(name,fn){test("PostgreSQL registration HTTP: "+name,async t=>{const f=await postgresFixture({runtimePoolSize:3}),s=await verifiedStaff(f),x=await invitationResearcher(f,s),i=await x.invitations.create(x.session.token,x.design.id,x.design.groups[0].id,{expires_at:Date.now()+86400000}),w=workspaceFixture(f,origin,{contactKey:randomBytes(32)});t.after(async()=>{await w.app.close();await f.close();});await fn(f,{...x,i,w});});}
async function preflight(x){const r=await x.w.app.inject({url:"/api/v2/registration/preflight",headers});assert.equal(r.statusCode,200);return {...headers,cookie:cookie(r,"pedpsy_registration_demo"),"x-pedpsy-csrf":r.json().csrf,"x-pedpsy-invite":x.i.invite_token};}
async function post(x,h,path,payload){return x.w.app.inject({method:"POST",url:"/api/v2/registration/"+path,headers:h,payload});}
async function started(x,h){const r=await post(x,h,"start",body);assert.equal(r.statusCode,200);assert.deepEqual(r.json(),{status:"confirmation_requested"});}
async function proof(x,h){const r=await post(x,h,"receipt",{});assert.equal(r.statusCode,200);assert.equal(r.json().synthetic,true);return r.json().confirmation_token;}
async function noClinical(f,x){assert.equal((await f.admin.query("SELECT (SELECT count(*) FROM pedpsy.stage_enrollments WHERE study_id=$1)+(SELECT count(*) FROM pedpsy.attempts WHERE study_id=$1) n",[x.design.id])).rows[0].n,"0");}
scenario("complete individual test registration and scoped return after group invite revoke; no automatic enrollment/session on proof",async(f,x)=>{
  const h=await preflight(x),ctx=await x.w.app.inject({url:"/api/v2/registration/context",headers:h});assert.equal(ctx.statusCode,200);assert.equal(ctx.json().study_id,x.design.id);await started(x,h);
  assert.equal((await f.admin.query("SELECT count(*) n FROM pedpsy.participants WHERE study_id=$1",[x.design.id])).rows[0].n,"0");const code=await proof(x,h),c=await post(x,h,"confirm",{confirmation_token:code});assert.deepEqual(c.json(),{status:"sign_in_required"});assert.equal(c.headers["set-cookie"],undefined);
  assert.equal((await f.admin.query("SELECT count(*) n FROM pedpsy.participant_sessions WHERE study_id=$1",[x.design.id])).rows[0].n,"0");await noClinical(f,x);
  const input={study_id:x.design.id,email:body.email,password:body.password},login=await post(x,h,"login",input);assert.equal(login.statusCode,200);const own=cookie(login,"pedpsy_v2_demo"),raw=own.split("=")[1];assert.ok(!login.body.includes(raw),"session bearer in JSON");assert.ok(login.headers["set-cookie"].some(v=>v.startsWith("pedpsy_registration_demo=;")));
  const current=await x.w.app.inject({url:"/api/v2/participant/session",headers:{...headers,cookie:own}});assert.equal(current.statusCode,200);assert.deepEqual(current.json().attempts,[]);
  await x.invitations.revoke(x.session.token,x.design.id,x.design.groups[0].id,x.i.id,{expected_revision:0});const next=await preflight(x),again=await post(x,next,"login",input);assert.equal(again.statusCode,200);assert.ok(cookie(again,"pedpsy_v2_demo")!==own,"session not rotated");assert.equal((await x.w.app.inject({url:"/api/v2/participant/session",headers:{...headers,cookie:own}})).statusCode,401);await noClinical(f,x);
});
scenario("unconfirmed email and legacy internal code cannot bypass confirmation; rejected login creates no session",async(f,x)=>{
  const h=await preflight(x);await started(x,h);const input={study_id:x.design.id,email:body.email,password:body.password};assert.equal((await post(x,h,"login",input)).statusCode,401);
  const code=await proof(x,h);assert.equal((await post(x,h,"confirm",{confirmation_token:code})).statusCode,200);const loginId=(await f.admin.query("SELECT k.login_id FROM pedpsy.participant_credentials k WHERE k.study_id=$1",[x.design.id])).rows[0].login_id;
  const legacy=await x.w.app.inject({method:"POST",url:"/api/v2/participant/login",headers,payload:{login_id:loginId,password:body.password}});assert.equal(legacy.statusCode,401);assert.equal((await f.admin.query("SELECT count(*) n FROM pedpsy.participant_sessions WHERE study_id=$1",[x.design.id])).rows[0].n,"0");assert.equal((await post(x,h,"login",input)).statusCode,200);await noClinical(f,x);
});
scenario("another real HTTP browser cannot receive/consume own proof or decrement attempts; denial contains metadata only",async(f,x)=>{
  const a=await preflight(x),b=await preflight(x);await started(x,a);const code=await proof(x,a);assert.equal((await post(x,b,"receipt",{})).statusCode,404);assert.equal((await post(x,b,"confirm",{confirmation_token:code})).statusCode,404);
  assert.equal((await f.admin.query("SELECT attempts_remaining FROM pedpsy.registration_pending WHERE study_id=$1",[x.design.id])).rows[0].attempts_remaining,5);assert.equal((await post(x,a,"confirm",{confirmation_token:code})).statusCode,200);
  const audit=(await f.admin.query("SELECT * FROM pedpsy.access_audit_events WHERE action='participants.registration.http_denied'")).rows;assert.ok(audit.length>=2);for(const v of [body.email,body.password,code,x.i.invite_token,a.cookie,b.cookie])assert.ok(!JSON.stringify(audit).includes(v),"private value in denial audit");assert.ok(audit.every(r=>r.study_id===null&&r.credential_id===null&&r.actor_role===null));await noClinical(f,x);
});
scenario("renamed staff/session nonce, forged scope and wrong Origin denied before registration identity writes",async(f,x)=>{
  const h=await preflight(x);for(const request of [{headers:{...h,cookie:"pedpsy_registration_demo="+"s".repeat(43)},payload:body},
    {headers:{...h,origin:"https://other.test"},payload:body},{headers:h,payload:{...body,group_id:x.design.groups[1].id}},
    {headers:h,payload:{...body,role:"superadministrator"}},{headers:{...h,cookie:h.cookie+"; "+h.cookie},payload:body}]){
    const r=await post(x,request.headers,"start",request.payload);assert.ok([400,403].includes(r.statusCode));assert.ok(!r.body.includes(body.password));
  }assert.equal((await f.admin.query("SELECT count(*) n FROM pedpsy.registration_pending WHERE study_id=$1",[x.design.id])).rows[0].n,"0");await noClinical(f,x);
});
for(const mutation of ["revocation","notice"])scenario(mutation+" after start prevents HTTP receipt/confirmation, keeps identity absent",async(f,x)=>{
  const h=await preflight(x);await started(x,h);const code=await proof(x,h);
  if(mutation==="revocation")await x.invitations.revoke(x.session.token,x.design.id,x.design.groups[0].id,x.i.id,{expected_revision:0});
  else{await f.admin.query("INSERT INTO pedpsy.contact_notices VALUES('demo-http-2','Synthetic changed HTTP notice','synthetic_only')");await f.admin.query("UPDATE pedpsy.study_contact_policies SET notice_version='demo-http-2' WHERE study_id=$1",[x.design.id]);}
  assert.equal((await post(x,h,"receipt",{})).statusCode,mutation==="notice"?409:404);assert.equal((await post(x,h,"confirm",{confirmation_token:code})).statusCode,mutation==="notice"?409:404);assert.equal((await f.admin.query("SELECT count(*) n FROM pedpsy.participants WHERE study_id=$1",[x.design.id])).rows[0].n,"0");await noClinical(f,x);
});
scenario("mandatory HTTP denial audit failure redacts details and returns 500 without changing pending identity",async(f,x)=>{
  const h=await preflight(x);await started(x,h);await f.admin.query("CREATE FUNCTION pedpsy.synthetic_registration_http_audit_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='participants.registration.http_denied' THEN RAISE EXCEPTION 'synthetic private audit failure'; END IF;RETURN NEW;END $$;CREATE TRIGGER synthetic_registration_http_audit_fail BEFORE INSERT ON pedpsy.access_audit_events FOR EACH ROW EXECUTE FUNCTION pedpsy.synthetic_registration_http_audit_fail()");
  const r=await post(x,{...h,"x-pedpsy-csrf":"wrong"},"confirm",{confirmation_token:"c".repeat(43)});assert.equal(r.statusCode,500);assert.deepEqual(r.json(),{error:"INTERNAL_ERROR"});assert.equal((await f.admin.query("SELECT status FROM pedpsy.registration_pending WHERE study_id=$1",[x.design.id])).rows[0].status,"pending");assert.equal((await f.admin.query("SELECT count(*) n FROM pedpsy.participants WHERE study_id=$1",[x.design.id])).rows[0].n,"0");await noClinical(f,x);
});
scenario("disabled registration does not require new denial SQL and keeps actual staff MFA login working",async(f,x)=>{
  const disabled=workspaceFixture(f);try{await f.admin.query("DROP FUNCTION pedpsy.record_registration_http_denial(text)");
    for(const [method,path,payload]of [["GET","preflight",undefined],["POST","start",body]]){const r=await disabled.app.inject({method,url:"/api/v2/registration/"+path,headers,payload});assert.equal(r.statusCode,503);assert.deepEqual(r.json(),{error:"REGISTRATION_NOT_CONFIGURED"});}
    const staff=await staffHttp(f,disabled);assert.equal((await disabled.app.inject({url:"/api/v2/staff/session",headers:staff.headers})).statusCode,200);
  }finally{await disabled.app.close();}await noClinical(f,x);
});
