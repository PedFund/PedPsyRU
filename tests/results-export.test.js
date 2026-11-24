"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict");
const {resultsCsv,resultsExcel}=require("../dist/src/application/results-export.js");
const data={study_id:"study-1",participants:[
  {participant_id:"11111111-1111-4111-8111-111111111111",
   profile:{schema_version:1,status:"completed",fields:[
     {key:"sex",label:"Пол",kind:"single_choice",options:[{value:"female",label:"Женский"}]},
     {key:"age",label:"Возраст",kind:"integer"}],values:{sex:"female",age:34}},
   consents:[{purpose:"contact_processing",document_version:"v1",accepted_at_ms:1},{purpose:"study_participation",document_version:"v2",accepted_at_ms:2}],
   results:[{release_id:"r1",method_id:"stai",method_title:"Шкала тревожности",method_version_id:"stai@1",attempt_id:"a1",completed_at:"2026-11-24T00:00:00Z",
     classifications:[{code:"st",label:"Ситуативная",value:"Высокая"}],measures:[{code:"st",label:"СТ",value:60}]}]},
  {participant_id:"22222222-2222-4222-8222-222222222222",
   profile:{schema_version:1,status:"completed",fields:[{key:"sex",label:"Пол",kind:"single_choice",options:[{value:"male",label:"Мужской"}]}],values:{sex:"male"}},
   consents:[],results:[]}
]};
test("results CSV: anonymous id, profile, consents, indicator before raw score",()=>{
  const csv=resultsCsv(data);
  assert.match(csv,/ID участника;Пол;Возраст;Согласие:/);
  assert.match(csv,/Шкала тревожности — Показатель: Ситуативная/);
  assert.match(csv,/Шкала тревожности — Сырой балл: СТ/);
  assert.match(csv,/Женский;34;Да;Да;/);
  assert.doesNotMatch(csv,/email|почта/i);
});
test("results Excel: indicator cells are highlighted before raw cells",()=>{
  const xml=resultsExcel(data);
  const indicator=xml.indexOf('ss:StyleID="IndicatorHeader"');
  const raw=xml.indexOf('ss:StyleID="RawHeader"');
  assert.ok(indicator>=0&&raw>indicator);
  assert.match(xml,/ss:StyleID="Indicator"/);
  assert.match(xml,/ss:Color="#FFF9E6"/);
  assert.match(xml,/<Data ss:Type="Number">60<\/Data>/);
  assert.match(xml,/11111111-1111-4111-8111-111111111111/);
  assert.doesNotMatch(xml,/email|почта/i);
});
