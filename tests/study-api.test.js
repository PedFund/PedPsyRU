"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict");
const {createStudyApi,studyId}=require("../dist/src/application/study-api.js");
test("constructor input is strict, normalized and never client authority",async()=>{
  const calls=[],api=createStudyApi({create:async(...x)=>calls.push(x),read:async(...x)=>calls.push(x)},{assert:(t,c)=>{if(c!=="csrf")throw Error("csrf");}});
  for(const input of [{title:""},{title:"x",user_id:"client"},{title:"x",role:"superadministrator"},{title:"\nsecret"},{title:"x".repeat(201)},[],null])assert.throws(()=>api.create("token",input,"csrf"),e=>e.code==="INVALID_STUDY_INPUT");
  assert.throws(()=>api.create("token",{title:"x"},"bad"),/csrf/);await api.create("token",{title:"  Тест  "},"csrf");assert.deepEqual(calls,[["token","Тест"]]);
  assert.throws(()=>studyId("sql injection"),e=>e.status===404);
});
test("group input rejects extra authority, invalid kind and unsafe/stale revision shape",async()=>{
  const id="12345678-1234-1234-1234-123456789012",calls=[],api=createStudyApi({group:async(...x)=>calls.push(x)},{assert:()=>{}}),good={name:"КГ",kind:"control",expected_version:0};
  for(const bad of [{...good,status:"active"},{...good,kind:"owner"},{...good,expected_version:-1},{...good,expected_version:"0"},{...good,expected_version:2147483647},{...good,name:"x".repeat(101)}])assert.throws(()=>api.group("token",id,undefined,bad,"csrf"),e=>e.status===400);
  await api.group("token",id,undefined,good,"csrf");assert.deepEqual(calls[0],["token",id,undefined,good]);
});
test("stage input is strict and accepts custom names without an implicit parent",async()=>{
  const id="12345678-1234-1234-1234-123456789012",calls=[],api=createStudyApi({stage:async(...x)=>calls.push(x)},{assert:()=>{}}),good={code:"T0",ordinal:0,expected_version:0};
  for(const bad of [{...good,based_on_stage_id:id},{...good,ordinal:-1},{...good,ordinal:10000},{...good,ordinal:"0"},{...good,code:"x".repeat(41)}])assert.throws(()=>api.stage("token",id,undefined,bad,"csrf"),e=>e.status===400);
  await api.stage("token",id,undefined,good,"csrf");assert.deepEqual(calls[0],["token",id,undefined,good]);
});
