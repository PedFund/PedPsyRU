"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const {createParticipantApp}=require("../dist/src/http/participant-app.js");

const origin="http://127.0.0.1:4174";
const headers={host:"127.0.0.1:4174",origin,"content-type":"application/json"};

function stored(methodVersionId,measures,classifications){
  return {id:"result",attemptId:"attempt",inputRevision:1,responsesDigest:"synthetic",calculatedAt:"2026-11-09T00:00:00.000Z",
    payload:{status:"scored",contract_version:"1.0",method_version_id:methodVersionId,handler_version:"approved-numeric-1.0.0",
      quality:{valid_response_count:1,complete:true,usable_for_aggregation:true},measures,classifications,warnings:[],calculation:{algorithm_id:"approved-numeric-1.0.0",key_digest:"synthetic"}}};
}
const measure=(code,value)=>({code,label:code+" — подпись",value,value_type:"number",representation:"raw",precision:2});
const level=(code,value)=>({code:code+" – уровень",label:code+" — подпись – уровень",value});

function appFor(result){
  const api={denied:async()=>{},login:async()=>({}),session:async()=>({}),logout:async()=>{},form:async()=>({}),
    read:async()=>({}),save:async()=>{},complete:async()=>result,result:async()=>result};
  return createParticipantApp(api,origin);
}
async function complete(result){
  const app=appFor(result);
  try{const response=await app.inject({method:"POST",url:"/api/v2/participant/attempts/attempt/complete",headers,payload:{expected_revision:1}});
    assert.equal(response.statusCode,200,response.body);return response.json();}
  finally{await app.close();}
}

test("participant result: Motkov keeps the general harmony and pseudohigh category",async()=>{
  const codes=["I_A","I_B","II_A","II_B","III_A","III_B","IV_A","IV_B","V_A","V_B","VI_A","VI_B","pk_A","pk_B"];
  const body=await complete(stored("motkov_psychological_culture_18@1.0.0-staging",
    codes.map(code=>measure(code,4.8)),
    codes.map(code=>level(code,"псевдовысокий")).concat([level("gpk","псевдовысокий")])));
  assert.equal(body.presentation.title,"Психологическая культура личности");
  assert.equal(body.presentation.groups.length,6);
  assert.equal(body.presentation.summary.level.value,"псевдовысокий");
  assert.equal(body.presentation.summary.level.index,3);
  assert.match(body.presentation.summary.level.text,/Общий уровень учитывает/);
  assert.equal(body.classifications.find(item=>item.code==="gpk – уровень").value,"псевдовысокий");
  assert.equal(JSON.stringify(body).includes("very_high"),false);
});

test("participant result: Shipilov extreme levels are not dropped",async()=>{
  const body=await complete(stored("uvlk_shipilov@1.0.0-staging",
    [measure("total",3),measure("motivational",1),measure("motivational_sphere",1)],
    [level("total","extremely_low")]));
  assert.equal(body.classifications.find(item=>item.code==="total – уровень").value,"крайне низкий");
  assert.equal(body.presentation.summary.level.value,"крайне низкий");
  assert.equal(body.presentation.summary.level.index,0);
  assert.equal(body.presentation.summary.colors,5);
  assert.equal(JSON.stringify(body).includes("extremely_low"),false);
});

test("participant result: Ryff profile and three-level total are projected",async()=>{
  const codes=["positive_relations","autonomy","environment_mastery","personal_growth","purpose_in_life","self_acceptance","overall"];
  const body=await complete(stored("ryff_pwb_84_shevelenkova_fesenko@1.0.0-staging",
    codes.map(code=>measure(code,300)),
    [level("overall","low")]));
  assert.equal(body.presentation.groups.length,1);
  assert.equal(body.presentation.groups[0].measures.length,6);
  assert.equal(body.presentation.summary.colors,3);
  assert.equal(body.presentation.summary.level.value,"низкий");
  assert.match(body.presentation.summary.measures[0].level_text,/выражены слабо/);
});

test("participant result: methods without a catalog keep the legacy shape",async()=>{
  const body=await complete(stored("legacy_method@1.0.0-local",[measure("goals",30)],[level("goals","low")]));
  assert.equal(body.presentation,undefined);
  assert.equal(body.measures[0].value,30);
});
