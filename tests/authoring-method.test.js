"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict");
const {validateAuthoringDefinition,scoreAuthoringNumeric}=require("../dist/src/adapters/authoring-method.js");
const definition={schema_version:1,type:"single_choice_numeric",
  method:{code:"demo_scale",title:"Демонстрационная шкала",short_title:"Демо",authors:["Автор"],instruction:"Оцените утверждения.",rights_confirmed:true},
  answer_scale:{minimum:0,maximum:4,step:1,has_labels:true,labels:[
    {value:0,label:"Нет"},{value:1,label:"Скорее нет"},{value:2,label:"Нейтрально"},{value:3,label:"Скорее да"},{value:4,label:"Да"}]},
  questions:[{id:"q01",text:"Я спокоен",reverse:false},{id:"q02",text:"Я напряжён",reverse:true}],
  indicators:[{code:"total",label:"Общий балл",items:["q01","q02"],aggregate:"sum",precision:2}],
  levels:{total:[{from:0,to:2,label:"Низкий"},{from:3,to:5,label:"Средний"},{from:6,to:8,label:"Высокий"}]}};
test("authoring compiler builds a declarative release and reverses answers",()=>{
  const result=validateAuthoringDefinition(definition);
  assert.equal(result.valid,true,result.errors.join("\n"));assert.ok(result.compiled);
  const compiled=result.compiled;
  assert.match(compiled.form_digest,/^sha256:[a-f0-9]{64}$/);
  assert.equal(compiled.key.reverseMin,0);assert.equal(compiled.key.reverseMax,4);
  const scored=scoreAuthoringNumeric({contract_version:"1.0",method_version_id:compiled.method_version_id,handler_version:"authoring-numeric-1.0.0",
    responses:[{item_id:"q01",value:"4"},{item_id:"q02",value:"1"}]},compiled.key);
  assert.equal(scored.status,"scored");assert.equal(scored.measures[0].value,4+3);
  assert.equal(scored.classifications[0].value,"Высокий");
});
test("authoring compiler rejects gaps and invalid answer scales",()=>{
  const bad=JSON.parse(JSON.stringify(definition));bad.answer_scale.step=3;
  const result=validateAuthoringDefinition(bad);
  assert.equal(result.valid,false);assert.ok(result.errors.some(error=>error.includes("делиться")));
  const gap=JSON.parse(JSON.stringify(definition));gap.levels.total=[{from:0,to:2,label:"Низкий"},{from:6,to:8,label:"Высокий"}];
  assert.equal(validateAuthoringDefinition(gap).valid,false);
});
