"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict");
const {resultsCsv,resultsXlsx}=require("../dist/src/application/results-export.js");
const data={study_id:"study-1",participants:[
  {participant_id:"11111111-1111-4111-8111-111111111111",
   profile:{schema_version:1,status:"completed",fields:[
     {key:"sex",label:"Пол",kind:"single_choice",options:[{value:"female",label:"Женский"}]},
     {key:"age",label:"Возраст",kind:"integer"}],values:{sex:"female",age:34}},
   consents:[{purpose:"contact_processing",document_version:"v1",accepted_at_ms:1},{purpose:"study_participation",document_version:"v2",accepted_at_ms:2}],
   results:[{release_id:"r1",method_id:"stai",method_title:"Шкала тревожности",method_version_id:"stai@1",attempt_id:"a1",completed_at:"2026-11-24T00:00:00Z",
     classifications:[{code:"st",label:"Ситуативная",value:"Высокая"}],measures:[{code:"st",label:"СТ",value:60}],
     responses:[{item_id:"q01",ordinal:1,value:"3",label:"Я спокоен"}]}]},
  {participant_id:"22222222-2222-4222-8222-222222222222",
   profile:{schema_version:1,status:"completed",fields:[{key:"sex",label:"Пол",kind:"single_choice",options:[{value:"male",label:"Мужской"}]}],values:{sex:"male"}},
   consents:[],results:[]}
]};
function zipEntries(buffer){
  const out=new Map();let offset=0;
  while(offset+30<=buffer.length&&buffer.readUInt32LE(offset)===0x04034b50){
    const nameLength=buffer.readUInt16LE(offset+26),extraLength=buffer.readUInt16LE(offset+28),size=buffer.readUInt32LE(offset+18);
    const name=buffer.subarray(offset+30,offset+30+nameLength).toString("utf8");
    const start=offset+30+nameLength+extraLength;out.set(name,buffer.subarray(start,start+size).toString("utf8"));
    offset=start+size;
  }
  return out;
}
test("results CSV: anonymous id, profile, consents, indicators, measures and primary answers",()=>{
  const csv=resultsCsv(data);
  assert.match(csv,/ID участника;Пол;Возраст;Согласие:/);
  assert.match(csv,/Шкала тревожности — Индикатор: Ситуативная/);
  assert.match(csv,/Шкала тревожности — Показатель: СТ/);
  assert.match(csv,/Шкала тревожности — Вопрос 1: Я спокоен/);
  assert.match(csv,/Женский;34;Да;Да;/);
  assert.doesNotMatch(csv,/email|почта/i);
});
test("results XLSX: passport sheet first, then one short-named sheet per method",async()=>{
  const buffer=await resultsXlsx(data);assert.equal(buffer.readUInt32LE(0),0x04034b50);
  const files=zipEntries(buffer),workbook=files.get("xl/workbook.xml")||"";
  assert.match(workbook,/Паспортичка/);
  assert.match(workbook,/Шкала тревожности/);
  const sheet=files.get("xl/worksheets/sheet2.xml")||"";
  assert.match(sheet,/Индикатор: Ситуативная/);
  assert.match(sheet,/Пол/);
  assert.match(sheet,/Возраст/);
  assert.match(sheet,/Показатель: СТ/);
  assert.match(sheet,/Вопрос 1: Я спокоен/);
  assert.doesNotMatch(JSON.stringify([...files.values()]),/email|почта/i);
});
