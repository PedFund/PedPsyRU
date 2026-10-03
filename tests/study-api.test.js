"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict");
const {createStudyApi,studyId}=require("../dist/src/application/study-api.js");
test("constructor input is strict, normalized and never client authority",async()=>{
  const calls=[],api=createStudyApi({create:async(...x)=>calls.push(x),read:async(...x)=>calls.push(x)},{assert:(t,c)=>{if(c!=="csrf")throw Error("csrf");}});
  for(const input of [{title:""},{title:"x",user_id:"client"},{title:"x",role:"superadministrator"},{title:"\nsecret"},{title:"x".repeat(201)},[],null])assert.throws(()=>api.create("token",input,"csrf"),e=>e.code==="INVALID_STUDY_INPUT");
  assert.throws(()=>api.create("token",{title:"x"},"bad"),/csrf/);await api.create("token",{title:"  Тест  "},"csrf");assert.deepEqual(calls,[["token","Тест"]]);
  assert.throws(()=>studyId("sql injection"),e=>e.status===404);
});
