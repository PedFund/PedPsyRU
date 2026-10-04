"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict"),{randomUUID}=require("node:crypto");
const {postgresFixture}=require("./postgres-fixture.js"),{verifiedStaff}=require("./mfa-fixture.js"),{studyResearcher}=require("./study-fixture.js");
const {workspaceFixture,headers}=require("./workspace-fixture.js"),{csrfFor}=require("../storage/access.js");
const {PostgresGroupInvitations}=require("../dist/src/adapters/postgres/group-invitations.js"),{tokenHash}=require("../dist/src/adapters/postgres/account-transaction.js");
function scenario(name,fn){test("PostgreSQL staff researcher workflow: "+name,async t=>{
  const f=await postgresFixture({runtimePoolSize:2}),w=workspaceFixture(f);t.after(async()=>{await w.app.close();await f.close();});
  const s=await verifiedStaff(f),x=await studyResearcher(f,s);await fn(f,w,x,s);
});}
const staffHeaders=s=>({...headers,cookie:"pedpsy_staff_demo="+s.session.token,"x-pedpsy-csrf":csrfFor(s.session.token)});
async function waitForManager(f){const until=Date.now()+2000;while(Date.now()<until){if((await f.admin.query("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=$1 AND wait_event_type='Lock' AND query LIKE '%rename_study%') waiting",[f.database])).rows[0].waiting)return;await new Promise(r=>setTimeout(r,10));}assert.fail("staff manager never reached lock wait");}
async function configured(f,x,token,owner){let d=owner?await x.studies.createFor(token,owner,"Synthetic managed"):await x.studies.create(token,"Synthetic owned");
  d=await x.studies.group(token,d.id,undefined,{name:"КГ",kind:"control",expected_version:d.version});
  d=await x.studies.stage(token,d.id,undefined,{code:"T0",ordinal:0,expected_version:d.version});
  return x.studies.assign(token,d.id,{group_id:d.groups[0].id,stage_id:d.stages[0].id,release_ids:[f.seed.release_id],expected_version:d.version});
}
for(const role of ["administrator","superadministrator"])scenario(role+" executes full HTTP workflow globally; real actor and owner preserved",async(f,w,x,s)=>{
  const staff=role===s.role?s:await verifiedStaff(f,role),h=staffHeaders(staff);
  const send=async(path,input,method="POST")=>{const r=await w.app.inject({method,url:"/api/v2/staff/studies"+path,headers:h,payload:input});assert.equal(r.statusCode,200,r.body);return r.json();};
  let d=await send("",{title:"Staff managed",owner_credential_id:x.row.id});
  assert.ok((await x.gateway.home(x.session.token)).studies.some(y=>y.id===d.id));
  assert.deepEqual((await f.admin.query("SELECT user_id,role FROM pedpsy.study_memberships WHERE study_id=$1",[d.id])).rows,[{user_id:x.row.user_id,role:"researcher"}]);
  d=await send("/"+d.id+"/groups",{name:"КГ",kind:"control",expected_version:d.version});
  d=await send("/"+d.id+"/groups/"+d.groups[0].id,{name:"ЭГ",kind:"experimental",expected_version:d.version},"PATCH");
  d=await send("/"+d.id+"/stages",{code:"T0",ordinal:0,expected_version:d.version});
  d=await send("/"+d.id+"/stages/"+d.stages[0].id,{code:"Baseline",ordinal:0,expected_version:d.version},"PATCH");
  d=await send("/"+d.id+"/assignments",{group_id:d.groups[0].id,stage_id:d.stages[0].id,release_ids:[f.seed.release_id],expected_version:d.version});
  d=await send("/"+d.id+"/stages/copy",{source_stage_id:d.stages[0].id,code:"T1",ordinal:1,expected_version:d.version});assert.equal(d.assignments.length,2);
  d=await send("/"+d.id,{title:"Final title",expected_version:d.version},"PATCH");
  d=await send("/"+d.id+"/lifecycle",{status:"active",expected_version:d.version});
  const invitePath="/"+d.id+"/groups/"+d.groups[0].id+"/invitations",invite=await send(invitePath,{expires_at:Date.now()+86400000});
  const saved=(await f.admin.query("SELECT created_by,created_by_staff FROM pedpsy.group_invitations WHERE id=$1",[invite.id])).rows[0];
  assert.deepEqual(saved,{created_by:null,created_by_staff:staff.id});
  const list=await w.app.inject({url:"/api/v2/staff/studies"+invitePath,headers:h});assert.equal(list.statusCode,200);assert.ok(!list.body.includes(invite.invite_token));
  assert.equal((await send(invitePath+"/"+invite.id+"/revoke",{expected_revision:0})).status,"revoked");
  const frozen=await w.app.inject({method:"PATCH",url:"/api/v2/staff/studies/"+d.id,headers:h,payload:{title:"Forbidden rewrite",expected_version:d.version}});assert.equal(frozen.statusCode,409);assert.equal(frozen.json().error,"DESIGN_FROZEN");
  d=await send("/"+d.id+"/lifecycle",{status:"closed",expected_version:d.version});
  const audit=(await f.admin.query("SELECT credential_id,actor_role,action,resource_id FROM pedpsy.access_audit_events WHERE study_id=$1 AND outcome='allow'",[d.id])).rows;
  for(const action of ["studies.create","studies.groups","studies.stages","studies.assignments","studies.stage_copy","studies.title","studies.lifecycle","participants.invites.create","participants.invites.revoke"]){
    assert.ok(audit.some(a=>a.action===action&&a.credential_id===staff.id&&a.actor_role===role),action);
  }
  assert.equal((await f.admin.query("SELECT count(*)::integer n FROM pedpsy.participants WHERE study_id=$1",[d.id])).rows[0].n,0);
  assert.equal((await f.admin.query("SELECT count(*)::integer n FROM pedpsy.researcher_sessions WHERE user_id=$1",[staff.user])).rows[0].n,0);
});
scenario("staff and owner race for the same quota/CAS; no bypass through a manager",async(f,w,x,s)=>{
  const a=await configured(f,x,x.session.token),b=await configured(f,x,s.session.token,x.row.id);
  const results=await Promise.allSettled([[a,x.session.token],[b,s.session.token]].map(([d,token])=>x.studies.lifecycle(token,d.id,{status:"active",expected_version:d.version})));
  assert.equal(results.filter(r=>r.status==="fulfilled").length,1);assert.equal(results.find(r=>r.status==="rejected").reason.code,"STUDY_QUOTA");
  const draft=results[0].status==="fulfilled"?b:a;
  const writes=await Promise.allSettled([x.session.token,s.session.token].map(token=>x.studies.title(token,draft.id,{title:"Synthetic updated",expected_version:draft.version})));
  assert.equal(writes.filter(r=>r.status==="fulfilled").length,1);assert.equal(writes.find(r=>r.status==="rejected").reason.code,"DESIGN_CONFLICT");
});
scenario("fresh MFA and current identity required; staff cannot forge participant writes or edit methods",async(f,w,x,s)=>{
  const d=await x.studies.create(x.session.token,"Owner draft"),h=staffHeaders(s);
  for(const cookie of ["pedpsy_staff_demo="+x.session.token,"pedpsy_staff_demo="+f.raw,"pedpsy_pending_demo="+s.session.token])
    assert.equal((await w.app.inject({method:"PATCH",url:"/api/v2/staff/studies/"+d.id,headers:{...h,cookie},payload:{title:"Cross realm",expected_version:0}})).statusCode,401);
  for(const change of [{origin:"https://other.test"},{"x-pedpsy-csrf":"wrong"}])assert.equal((await w.app.inject({method:"PATCH",url:"/api/v2/staff/studies/"+d.id,headers:{...h,...change},payload:{title:"Bad",expected_version:0}})).statusCode,403);
  await f.admin.query("UPDATE pedpsy.staff_sessions SET created_at_ms=$2::bigint,mfa_verified_at=to_timestamp($2::bigint/1000.0) WHERE token_hash=$1",[tokenHash(s.session.token),Date.now()-360000]);
  await assert.rejects(x.studies.title(s.session.token,d.id,{title:"Stale MFA",expected_version:0}),e=>e.code==="MFA_RECHECK_REQUIRED");
  assert.equal((await x.studies.read(s.session.token,d.id)).version,0);
  await f.admin.query("UPDATE pedpsy.staff_credentials SET status='revoked',version=version+1 WHERE id=$1",[s.id]);
  await assert.rejects(x.studies.title(s.session.token,d.id,{title:"Revoked",expected_version:0}),e=>e.status===401);
  const a=await verifiedStaff(f,"administrator");
  for(const path of ["staff/methods","staff/processing"])assert.equal((await w.app.inject({method:"POST",url:"/api/v2/"+path,headers:staffHeaders(a),payload:{}})).statusCode,404);
  assert.equal((await w.app.inject({method:"PUT",url:"/api/v2/participant/attempts/"+f.seed.studies[0].attempts[0].id+"/draft",headers:{...headers,cookie:"pedpsy_v2_demo="+a.session.token,"x-pedpsy-csrf":csrfFor(a.session.token)},payload:{}})).statusCode,401);
});
scenario("mandatory staff audit failure rolls back creation and editing without changing owner history",async(f,w,x,s)=>{
  const d=await x.studies.create(x.session.token,"Before"),before=(await f.admin.query("SELECT count(*)::integer n FROM pedpsy.studies")).rows[0].n;
  await f.admin.query("CREATE FUNCTION pedpsy.synthetic_staff_design_audit_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.reason='STUDY_DESIGN' THEN RAISE EXCEPTION 'synthetic failure'; END IF; RETURN NEW; END $$;CREATE TRIGGER synthetic_staff_design_audit_fail BEFORE INSERT ON pedpsy.access_audit_events FOR EACH ROW EXECUTE FUNCTION pedpsy.synthetic_staff_design_audit_fail()");
  await assert.rejects(x.studies.createFor(s.session.token,x.row.id,"Rollback"),/synthetic failure/);
  await assert.rejects(x.studies.title(s.session.token,d.id,{title:"Rollback",expected_version:0}),/synthetic failure/);
  assert.equal((await f.admin.query("SELECT count(*)::integer n FROM pedpsy.studies")).rows[0].n,before);
  assert.equal((await f.admin.query("SELECT title,design_version FROM pedpsy.studies WHERE id=$1",[d.id])).rows[0].title,"Before");
});
scenario("explicit creation owner must be active; private helpers and creator provenance remain inaccessible/immutable",async(f,w,x,s)=>{
  await assert.rejects(x.studies.createFor(x.session.token,x.row.id,"Impersonation"),e=>e.status===401);
  for(const sql of ["SELECT pedpsy.lock_managed_study_owner(gen_random_uuid())","SELECT pedpsy.require_managed_study_owner(gen_random_uuid(),gen_random_uuid())","SELECT * FROM pedpsy.group_invitations"])
    await assert.rejects(f.runtime.query(sql),e=>e.code==="42501");
  let d=await configured(f,x,s.session.token,x.row.id);d=await x.studies.lifecycle(s.session.token,d.id,{status:"active",expected_version:d.version});
  const i=await new PostgresGroupInvitations(f.runtime).create(s.session.token,d.id,d.groups[0].id,{expires_at:Date.now()+10000});
  await assert.rejects(f.admin.query("UPDATE pedpsy.group_invitations SET created_by=$2,created_by_staff=NULL WHERE id=$1",[i.id,x.row.id]),e=>e.code==="23514");
  await x.management.block(s.session.token,x.row.id);
  await assert.rejects(x.studies.createFor(s.session.token,x.row.id,"Blocked owner"),e=>e.status===404);
  await assert.rejects(x.studies.createFor(s.session.token,randomUUID(),"Unknown owner"),e=>e.status===404);
  // Global managers retain close/control of a blocked researcher's existing work.
  assert.equal((await x.studies.lifecycle(s.session.token,d.id,{status:"closed",expected_version:d.version})).status,"closed");
});
scenario("staff revocation committed while waiting prevents write and allow audit",async(f,w,x,s)=>{
  const d=await x.studies.create(x.session.token,"Current staff"),owner=await f.admin.connect();let pending;
  try{await owner.query("BEGIN");await owner.query("SELECT id FROM pedpsy.staff_credentials WHERE id=$1 FOR UPDATE",[s.id]);
    pending=x.studies.title(s.session.token,d.id,{title:"Denied",expected_version:0}).then(value=>({value}),error=>({error}));await waitForManager(f);
    await owner.query("UPDATE pedpsy.staff_credentials SET status='revoked',version=version+1 WHERE id=$1",[s.id]);await owner.query("COMMIT");assert.equal((await pending).error?.status,401);
  }finally{await owner.query("ROLLBACK");owner.release();if(pending)await pending;}
  assert.equal((await f.admin.query("SELECT design_version FROM pedpsy.studies WHERE id=$1",[d.id])).rows[0].design_version,0);
  assert.equal((await f.admin.query("SELECT count(*)::integer n FROM pedpsy.access_audit_events WHERE study_id=$1 AND action='studies.title' AND outcome='allow'",[d.id])).rows[0].n,0);
});
scenario("owner membership removal during study lock wait is rechecked, not trusted from pre-read",async(f,w,x,s)=>{
  const d=await x.studies.create(x.session.token,"Current owner"),owner=await f.admin.connect();let pending;
  try{await owner.query("BEGIN");await owner.query("SELECT id FROM pedpsy.studies WHERE id=$1 FOR UPDATE",[d.id]);
    pending=x.studies.title(s.session.token,d.id,{title:"Denied",expected_version:0}).then(value=>({value}),error=>({error}));await waitForManager(f);
    await owner.query("UPDATE pedpsy.study_memberships SET status='revoked' WHERE study_id=$1 AND user_id=$2",[d.id,x.row.user_id]);await owner.query("COMMIT");assert.equal((await pending).error?.status,404);
  }finally{await owner.query("ROLLBACK");owner.release();if(pending)await pending;}
  assert.equal((await f.admin.query("SELECT title,design_version FROM pedpsy.studies WHERE id=$1",[d.id])).rows[0].title,"Current owner");
  assert.equal((await f.admin.query("SELECT count(*)::integer n FROM pedpsy.access_audit_events WHERE study_id=$1 AND action='studies.title' AND outcome='allow'",[d.id])).rows[0].n,0);
});
