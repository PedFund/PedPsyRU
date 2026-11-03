"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict"),{randomBytes,randomUUID}=require("node:crypto");
const {postgresFixture}=require("./postgres-fixture.js"),{workspaceFixture,staffHttp,headers,cookie}=require("./workspace-fixture.js");
function scenario(name,fn){test("PostgreSQL constructor HTTP: "+name,async t=>{const f=await postgresFixture({runtimePoolSize:2}),w=workspaceFixture(f);t.after(async()=>{await w.app.close();await f.close();});const s=await staffHttp(f,w);await fn(f,w,s);});}
async function researcherHttp(f,w,s){const invite=(await w.app.inject({method:"POST",url:"/api/v2/staff/researchers/invite",headers:s.headers,payload:{}})).json(),password=randomBytes(24).toString("base64url");
  assert.equal((await w.app.inject({method:"POST",url:"/api/v2/researcher/accept",headers,payload:{invite_code:invite.invite_code,password}})).statusCode,200);
  const login=await w.app.inject({method:"POST",url:"/api/v2/researcher/login",headers,payload:{login_id:invite.login_id,password}});assert.equal(login.statusCode,200);
  return {headers:{...headers,cookie:cookie(login,"pedpsy_researcher_demo"),"x-pedpsy-csrf":login.json().csrf},invite,password};}
const send=(w,r,path,payload,method="POST")=>w.app.inject({method,url:"/api/v2/researcher/studies"+path,headers:r.headers,payload});
scenario("actual cookie/CSRF full constructor persists and both staff see globally without diagnostics",async(f,w,s)=>{
  const r=await researcherHttp(f,w,s);let response=await send(w,r,"",{title:"Синтетическое исследование"});assert.equal(response.statusCode,200);let d=response.json();
  for(const [name,kind] of [["КГ","control"]]){response=await send(w,r,"/"+d.id+"/groups",{name,kind,expected_version:d.version});assert.equal(response.statusCode,200);d=response.json();}
  for(const group of d.groups)d=(await send(w,r,"/"+d.id+"/assignments",{group_id:group.id,stage_id:d.stages[0].id,release_ids:[f.seed.release_id],expected_version:d.version})).json();
  d=(await send(w,r,"/"+d.id+"/stages/copy",{source_stage_id:d.stages[0].id,code:"T1",ordinal:1,expected_version:d.version})).json();assert.equal(d.assignments.length,4);
  d=(await send(w,r,"/"+d.id,{title:"Новое название",expected_version:d.version},"PATCH")).json();assert.equal(d.title,"Новое название");
  d=(await send(w,r,"/"+d.id+"/lifecycle",{status:"active",expected_version:d.version})).json();assert.equal(d.status,"active");
  for(const staff of [s,await staffHttp(f,w,"administrator")]){const list=await w.app.inject({url:"/api/v2/staff/studies",headers:staff.headers});assert.equal(list.statusCode,200);assert.ok(list.json().some(x=>x.id===d.id));const read=await w.app.inject({url:"/api/v2/staff/studies/"+d.id,headers:staff.headers});assert.deepEqual(read.json(),d);}
  const closed=await send(w,r,"/"+d.id+"/lifecycle",{status:"closed",expected_version:d.version});assert.equal(closed.json().status,"closed");
  assert.equal((await f.admin.query("SELECT count(*)::integer n FROM pedpsy.participants WHERE study_id=$1",[d.id])).rows[0].n,0);assert.equal((await f.admin.query("SELECT count(*)::integer n FROM pedpsy.attempts")).rows[0].n,18);
  const own=await w.app.inject({url:"/api/v2/researcher/studies/"+d.id,headers:r.headers});for(const field of ["responses","measures","key_digest","form_snapshot","source_text","password_hash"])assert.ok(!own.body.includes(field));
});
scenario("scope/role/CSRF/origin/input/CAS failures are neutral and never partially persist",async(f,w,s)=>{
  const x=await researcherHttp(f,w,s),y=await researcherHttp(f,w,s),d=(await send(w,x,"",{title:"Own"})).json();
  for(const id of [d.id,randomUUID()]){const denied=await w.app.inject({url:"/api/v2/researcher/studies/"+id,headers:y.headers});assert.equal(denied.statusCode,404);assert.deepEqual(denied.json(),{error:"NOT_AVAILABLE"});}
  for(const extra of [{user_id:randomUUID()},{role:"administrator"},{dataset_kind:"real"}])assert.equal((await send(w,x,"",{title:"Wrong",...extra})).statusCode,400);
  for(const kind of [["control"],null,{}])assert.equal((await send(w,x,"/"+d.id+"/groups",{name:"Wrong kind",kind,expected_version:0})).statusCode,400);
  for(const h of [{...x.headers,origin:"https://foreign.test"},{...x.headers,"x-pedpsy-csrf":"bad"}])assert.equal((await send(w,{headers:h},"/"+d.id+"/groups",{name:"КГ",kind:"control",expected_version:0})).statusCode,403);
  const results=await Promise.all(["One","Two"].map(title=>send(w,x,"/"+d.id,{title,expected_version:0},"PATCH")));assert.deepEqual(results.map(r=>r.statusCode).sort(),[200,409]);assert.equal(results.find(r=>r.statusCode===409).json().error,"DESIGN_CONFLICT");
  assert.equal((await send(w,{headers:{...s.headers,cookie:s.headers.cookie.replace("staff","researcher")}},"",{title:"Staff"})).statusCode,401);
  for(const path of ["staff/studies","staff/studies/"+d.id+"/groups"])assert.equal((await w.app.inject({method:"POST",url:"/api/v2/"+path,headers:s.headers,payload:{}})).statusCode,400);
  for(const path of ["staff/methods","staff/processing"])assert.equal((await w.app.inject({method:"POST",url:"/api/v2/"+path,headers:s.headers,payload:{}})).statusCode,404);
  assert.equal((await w.app.inject({url:"/api/v2/staff/studies",headers:{...x.headers,cookie:x.headers.cookie.replace("researcher","staff")}})).statusCode,401);
  assert.equal((await f.admin.query("SELECT count(*)::integer n FROM pedpsy.research_groups WHERE study_id=$1",[d.id])).rows[0].n,1);
});
scenario("mandatory audit failure rolls back groups, version and UI sees only a neutral 500",async(f,w,s)=>{
  const r=await researcherHttp(f,w,s),d=(await send(w,r,"",{title:"Rollback"})).json();await f.admin.query("CREATE FUNCTION pedpsy.synthetic_design_http_audit_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'private SQL detail'; END $$;CREATE TRIGGER synthetic_design_http_audit_fail BEFORE INSERT ON pedpsy.access_audit_events FOR EACH ROW EXECUTE FUNCTION pedpsy.synthetic_design_http_audit_fail()");
  const failed=await send(w,r,"/"+d.id+"/groups",{name:"КГ",kind:"control",expected_version:0});assert.equal(failed.statusCode,500);assert.deepEqual(failed.json(),{error:"INTERNAL_ERROR"});assert.equal((await f.admin.query("SELECT design_version FROM pedpsy.studies WHERE id=$1",[d.id])).rows[0].design_version,0);assert.equal((await f.admin.query("SELECT count(*)::integer n FROM pedpsy.research_groups WHERE study_id=$1",[d.id])).rows[0].n,1);
});
scenario("global directory and metadata size caps refuse instead of truncating",async(f,w,s)=>{
  const id=f.studyId;await f.admin.query("UPDATE pedpsy.studies SET title=repeat('x',4194305) WHERE id=$1",[id]);for(const path of ["staff/studies","staff/studies/"+id])assert.equal((await w.app.inject({url:"/api/v2/"+path,headers:s.headers})).statusCode,413);
  await f.admin.query("UPDATE pedpsy.studies SET title='Synthetic' WHERE id=$1",[id]);await f.admin.query("INSERT INTO pedpsy.studies(id,title) SELECT gen_random_uuid(),'Synthetic cap fixture' FROM generate_series(1,500-(SELECT count(*)::integer FROM pedpsy.studies))");
  const full=await w.app.inject({url:"/api/v2/staff/studies",headers:s.headers});assert.equal(full.statusCode,200);assert.equal(full.json().length,500);
  await f.admin.query("INSERT INTO pedpsy.studies(id,title) VALUES(gen_random_uuid(),'Synthetic 501')");const list=await w.app.inject({url:"/api/v2/staff/studies",headers:s.headers});assert.equal(list.statusCode,413);assert.deepEqual(list.json(),{error:"DESIGN_LIMIT"});
});
