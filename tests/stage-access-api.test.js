"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict");
const {createStageAccessApi}=require("../dist/src/application/stage-access-api.js");
const id="12345678-1234-1234-1234-123456789012";
test("stage access exact revision DTO, CSRF and scoped IDs; no client actor or implicit design activation",async()=>{
  const calls=[],row={id,study_id:id,group_id:id,stage_id:id,status:"open",revision:1,opened_at:1,opened_by_staff:"private",email:"private"};
  const api=createStageAccessApi({open:async(...x)=>{calls.push(x);return row;},list:async()=>[row]}, {assert:(_t,c)=>{if(c!=="csrf")throw Error("csrf");}});
  for(const body of [{},{expected_revision:"0"},{expected_revision:2},{expected_revision:-1},{expected_revision:0,role:"superadministrator"},{expected_revision:0,study_id:id},{expected_revision:0,opened_at:1}])assert.throws(()=>api.open("token",id,id,id,body,"csrf"),e=>e.status===400);
  assert.throws(()=>api.open("token",id,id,id,{expected_revision:0},"bad"),/csrf/);
  assert.throws(()=>api.open("token",id,"bad",id,{expected_revision:0},"csrf"),e=>e.status===404);
  for(const revision of [0,1]){const r=await api.open("token",id,id,id,{expected_revision:revision},"csrf");assert.deepEqual(Object.keys(r).sort(),["id","study_id","group_id","stage_id","status","revision","opened_at"].sort());}
  assert.deepEqual(calls.map(x=>x[4]),[{expected_revision:0},{expected_revision:1}]);assert.equal((await api.list("token",id,id))[0].email,undefined);
});
