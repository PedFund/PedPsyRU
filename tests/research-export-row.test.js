"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict");
const {projectRawResponseRow,RAW_RESPONSE_EXPORT_COLUMNS}=require("../dist/src/application/research-export-row.js");

const source=()=>({
  study_id:"study",participant_id:"pseudonym",group_id:"group",stage_id:"stage",
  assignment_id:"assignment",attempt_id:"attempt",release_id:"release",
  method_version_id:"version",handler_version:"handler",key_digest:"digest",
  item_id:"q01",answer:{selected:["A","B"],nested:{score:0}},attempt_status:"draft",revision:2,
  email:"private@example.test",phone:"+000",name:"Sensitive",password:"secret",
  authentication_token:"secret",score:999
});

test("raw export projection preserves nested primary answers and excludes identity, secrets and scores",()=>{
  const row=projectRawResponseRow(source());
  assert.deepEqual(Object.keys(row),RAW_RESPONSE_EXPORT_COLUMNS);
  assert.deepEqual(JSON.parse(row.answer_json),{selected:["A","B"],nested:{score:0}});
  for(const key of ["email","phone","name","password","authentication_token","score"])
    assert.equal(Object.hasOwn(row,key),false);
  assert.equal(row.participant_id,"pseudonym");
  assert.equal(row.attempt_status,"draft");
});

test("raw export projection preserves null, zero and unfinished attempts without scoring",()=>{
  for(const answer of [null,0,false,"",[],{rank:[12,11,10]}]){
    const row=projectRawResponseRow({...source(),answer});
    assert.deepEqual(JSON.parse(row.answer_json),answer);
    assert.equal(row.revision,2);
  }
});

test("raw export projection rejects malformed source, status, revision and identifiers",()=>{
  assert.throws(()=>projectRawResponseRow(null),TypeError);
  assert.throws(()=>projectRawResponseRow({...source(),attempt_status:"unknown"}),TypeError);
  assert.throws(()=>projectRawResponseRow({...source(),revision:-1}),TypeError);
  assert.throws(()=>projectRawResponseRow({...source(),revision:1.5}),TypeError);
  assert.throws(()=>projectRawResponseRow({...source(),item_id:""}),TypeError);
  assert.throws(()=>projectRawResponseRow({...source(),answer:undefined}),TypeError);
});
