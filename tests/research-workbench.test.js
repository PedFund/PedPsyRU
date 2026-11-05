"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict");
const {randomUUID}=require("node:crypto");
const {workbenchInput,createResearchWorkbenchApi,createParticipantProfileApi}=require("../dist/src/application/research-workbench-api.js");
const id="11111111-1111-4111-8111-111111111111";
test("research workbench rejects forged metadata, arbitrary stages and excessive passport fields",()=>{
  assert.throws(()=>workbenchInput("initialize",{expected_version:0,role:"administrator"}));
  assert.throws(()=>workbenchInput("stage",{expected_version:0,id:null,code:"T99",note:""}));
  assert.throws(()=>workbenchInput("group",{expected_version:0,id:null,name:"G",kind:"control",note:"x\nsecret"}));
  assert.throws(()=>workbenchInput("schema",{expected_version:0,all:true,group_id:null,schema_version:1,basic_fields:["sex"],fields:Array(6).fill({})}));
  assert.throws(()=>workbenchInput("schema",{expected_version:0,all:true,group_id:null,schema_version:1,basic_fields:["sex","sex"],fields:[]}));
  assert.deepEqual(workbenchInput("schema",{expected_version:0,all:true,group_id:null,schema_version:1,basic_fields:["education","sex"],fields:[]}).data.basic_fields,["sex","education"]);
  assert.deepEqual(workbenchInput("stage",{expected_version:1,id:null,code:"T1",note:" После "}).data,{id:null,code:"T1",note:"После"});
  assert.deepEqual(workbenchInput("stage",{expected_version:1,id:null,code:"T49",note:""}).data,{id:null,code:"T49",note:""});
  assert.deepEqual(workbenchInput("copy_assignments",{expected_version:2,stage_id:id}).data,{stage_id:id});
  assert.throws(()=>workbenchInput("copy_assignments",{expected_version:2,stage_id:"T1"}));
  assert.deepEqual(workbenchInput("delete_stage",{expected_version:2,stage_id:id}).data,{stage_id:id});
  assert.throws(()=>workbenchInput("delete_stage",{expected_version:2,stage_id:"T1"}));
  assert.throws(()=>workbenchInput("delete_stage",{expected_version:2}));
});
test("bulk assignments are explicit and do not accept duplicate or caller-owned releases",()=>{
  const b={expected_version:2,all:false,group_id:id,stage_id:id,release_ids:[id]};
  assert.equal(workbenchInput("assign",b).data.all,false);
  assert.throws(()=>workbenchInput("assign",{...b,release_ids:[id,id]}));
  assert.throws(()=>workbenchInput("assign",{...b,all:"yes"}));
  assert.throws(()=>workbenchInput("assign",{...b,release_ids:["foreign"]}));
});
test("workbench assignment accepts 30 unique releases and rejects 31",()=>{
  const base={expected_version:2,all:false,group_id:id,stage_id:id};
  const ids=n=>Array.from({length:n},()=>randomUUID());
  assert.equal(workbenchInput("assign",{...base,release_ids:ids(30)}).data.release_ids.length,30);
  assert.throws(()=>workbenchInput("assign",{...base,release_ids:ids(31)}));
});
test("workbench and profile mutations require CSRF before storage, profile never accepts participant IDs",async()=>{
  let calls=0;const csrf={assert:()=>{throw Error("CSRF");}};
  const store={change:()=>{calls++;}};
  const api=createResearchWorkbenchApi(store,csrf),profiles=createParticipantProfileApi(store,csrf);
  assert.throws(()=>api.change("token",id,"initialize",{expected_version:0},"bad"),/CSRF/);
  assert.throws(()=>profiles.change("token","restart",{schema_version:1,expected_revision:2},"bad"),/CSRF/);
  assert.equal(calls,0);
  const own=createParticipantProfileApi(store,{assert:()=>{}});
  assert.throws(()=>own.change("token","restart",{schema_version:1,expected_revision:2,participant_id:id},"proof"));
});
