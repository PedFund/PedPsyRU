"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict"),{randomUUID}=require("node:crypto");
const {postgresFixture}=require("./postgres-fixture.js");
function scenario(name,fn){test("PostgreSQL participant admission: "+name,async t=>{const f=await postgresFixture({runtimePoolSize:2,seedData:false});t.after(()=>f.close());await fn(f);});}
const call=(f,code,limit=30,window=300000)=>f.runtime.query("SELECT * FROM pedpsy.participant_login_material_v2($1,$2,$3)",[code,limit,window]);
// An unknown code returns no material row (the dummy-hash path); it is admitted
// unless the function explicitly returns throttled=true.
const admitted=async(f,code,limit=30,window=300000)=>((await call(f,code,limit,window)).rows[0]?.throttled??false)===false;
const email=(f,study,address,allow,limit=30,window=300000)=>f.runtime.query("SELECT * FROM pedpsy.participant_email_login_material_v2($1,$2,$3,$4,$5)",[study,address,allow,limit,window]);
const globalCount=async f=>(await f.admin.query("SELECT count FROM pedpsy.login_throttles WHERE bucket_hash='sha256:'||encode(sha256(convert_to('pedpsy-login:global','UTF8')),'hex')")).rows[0]?.count;
scenario("default global admission admits 30 distinct codes and rejects the 31st",async f=>{
  for(let index=0;index<30;index++)assert.equal(await admitted(f,"T-"+index),true);
  assert.equal((await call(f,"T-30")).rows[0].throttled,true);
  assert.equal(await globalCount(f),30);
});
scenario("pilot admission admits 200 distinct participants without a global rejection",async f=>{
  for(let index=0;index<200;index++)assert.equal(await admitted(f,"P-"+index,900),true);
  assert.equal(await globalCount(f),200);
});
scenario("per-code five-per-window limit is unchanged under a pilot global limit",async f=>{
  for(let index=0;index<5;index++)assert.equal(await admitted(f,"SAME-CODE",900),true);
  const throttled=await call(f,"SAME-CODE",900);assert.equal(throttled.rows[0].throttled,true);
  assert.equal(await globalCount(f),6);
});
scenario("code and email login share one global bucket, so the higher pilot limit applies to both",async f=>{
  const study=randomUUID();
  for(let index=0;index<30;index++)assert.equal(await admitted(f,"G-"+index,30),true);
  assert.equal((await email(f,study,"unknown@example.test",false,30)).rows[0].throttled,true);
  assert.equal(((await email(f,study,"second@example.test",false,900)).rows[0]?.throttled??false),false);
  assert.equal(await globalCount(f),31);
});
scenario("pilot email login accepts a real address only when explicitly allowed",async f=>{
  const study=randomUUID();
  assert.equal((await email(f,study,"synthetic@example.test",false,900)).rowCount,0);
  assert.equal((await email(f,study,"Real.Person@Example.org",true,900)).rowCount,0);
  assert.equal((await email(f,study,"a".repeat(64)+"@example.org",true,900)).rowCount,0);
  await assert.rejects(email(f,study,"Real.Person@Example.org",false,900),error=>error.code==="22023");
  await assert.rejects(email(f,study,"not-an-address",true,900),error=>error.code==="22023");
});
scenario("legacy one-argument default remains strict and untouched",async f=>{
  const study=randomUUID();
  assert.equal((await f.runtime.query("SELECT throttled FROM pedpsy.participant_login_material('L-1')")).rowCount,0);
  await assert.rejects(f.runtime.query("SELECT * FROM pedpsy.participant_email_login_material($1,$2)",[study,"Real.Person@Example.org"]),error=>error.code==="22023");
});
scenario("invalid admission policy arguments fail closed before any throttle write",async f=>{
  for(const [limit,window] of [[0,300000],[1201,300000],[30,120000],[30,299999],[30,3600001]]){
    await assert.rejects(call(f,"X-1",limit,window),error=>error.code==="22023");
    await assert.rejects(email(f,randomUUID(),"x@example.test",false,limit,window),error=>error.code==="22023");
    await assert.rejects(f.runtime.query("SELECT pedpsy.reserve_registration_start_v2($1,$2,$3,$4,$5,$6,$7)",
      ["sha256:digest","sha256:browser","x@example.test","notice",false,limit,window]),error=>error.code==="22023");
  }
  assert.equal((await f.admin.query("SELECT count(*)::integer n FROM pedpsy.login_throttles")).rows[0].n,0);
});
