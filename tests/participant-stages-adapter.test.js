"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict");
const {PostgresParticipantStages}=require("../dist/src/adapters/postgres/participant-stages.js"),{tokenHash}=require("../dist/src/adapters/postgres/account-transaction.js");
test("stage discovery adapter: malformed own tokens rejected before database checkout",async()=>{
 let connects=0;const stages=new PostgresParticipantStages({connect:async()=>{connects++;throw Error("unexpected checkout");}});
 for(const token of ["",null,undefined,[],{},"A".repeat(42),"A".repeat(44)," "+"A".repeat(43),"a".repeat(42)+"!"])await assert.rejects(stages.read(token),e=>e.status===401&&e.code==="AUTH_REQUIRED");assert.equal(connects,0);assert.equal(Object.hasOwn(stages,"enroll"),false);
});
function fixture(error){const calls=[],snapshot={study_id:"own-study",group_id:"own-group",passport_schema_version:1,passport_completed:false,required_consents_accepted:false,stages:[]};let releases=0;
 const client={query:async(sql,args)=>{calls.push([sql,args]);if(sql.includes("AS unsafe"))return {rows:[{unsafe:false}]};if(sql==="SELECT pedpsy.read_own_stages() data"){if(error)throw error;return {rows:[{data:snapshot}]};}return {rows:[]};},release:()=>releases++};
 return {calls,snapshot,releases:()=>releases,stages:new PostgresParticipantStages({connect:async()=>client})};
}
test("stage discovery adapter: one fixed guarded SQL call, hashed own session LOCAL scope and bounded transaction",async()=>{
 const f=fixture(),token="A".repeat(43);assert.equal(await f.stages.read(token),f.snapshot);assert.equal(f.releases(),1);assert.ok(f.calls.some(([sql])=>sql.includes("statement_timeout','5000")&&sql.includes("lock_timeout','3000")));
 assert.deepEqual(f.calls.filter(([sql])=>sql.includes("app.session_hash")),[["SELECT set_config('app.session_hash',$1,true)",[tokenHash(token)]]]);assert.equal(f.calls.filter(([sql])=>sql==="SELECT pedpsy.read_own_stages() data").length,1);assert.equal(f.calls.at(-1)[0],"COMMIT");assert.ok(!JSON.stringify(f.calls).includes(token));
});
test("stage discovery adapter: failed authority rolls back, releases client and never returns cached stage data",async()=>{
 const f=fixture({code:"28000",message:"AUTH_REQUIRED"});await assert.rejects(f.stages.read("A".repeat(43)),e=>e.status===401);assert.equal(f.calls.at(-1)[0],"ROLLBACK");assert.ok(!f.calls.some(([sql])=>sql==="COMMIT"));assert.equal(f.releases(),1);
});
