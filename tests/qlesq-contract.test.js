"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {scoreQlesq,CONTRACT_VERSION,METHOD_VERSION_ID,HANDLER_VERSION}=require("../core/qlesq-contract.js");
const make=(fn)=>({contract_version:CONTRACT_VERSION,method_version_id:METHOD_VERSION_ID,handler_version:HANDLER_VERSION,
  responses:Array.from({length:36},(_,i)=>({item_id:"q"+String(i+1).padStart(2,"0"),value:String(fn(i+1))}))});
const by=(result,code)=>result.measures.find(x=>x.code===code)?.value;
test("36 items, nine disjoint four-item scales and four reverse items",()=>{
 const key=require("../methods/qlesq/keys/1.0.0-draft.json");
 const items=key.scales.flatMap(s=>s.items);assert.equal(key.scales.length,9);
 assert.ok(key.scales.every(s=>s.items.length===4));assert.equal(new Set(items).size,36);
 assert.deepEqual([...new Set(items)].sort((a,b)=>a-b),Array.from({length:36},(_,i)=>i+1));
 assert.deepEqual(key.reverse,[21,28,33,35]);
});
test("all answers at 1 reverse to 10 on four items",()=>{
 const r=scoreQlesq(make(()=>1));assert.equal(r.status,"scored");
 assert.equal(by(r,"quality_of_life_total"),72);assert.equal(by(r,"quality_of_life_index"),8);
 assert.equal(by(r,"quality_of_life_percent"),(8-4)/36*100);
 assert.equal(by(r,"optimism"),22); // direct 9 and 34 = 1+1; reverse 28 and 35 = 10+10
 assert.equal(by(r,"self_control"),13); // three direct 1s and one reverse 10
});
test("all answers at 10 reverse to 1 on four items",()=>{
 const r=scoreQlesq(make(()=>10));assert.equal(r.status,"scored");
 assert.equal(by(r,"quality_of_life_total"),324);assert.equal(by(r,"quality_of_life_index"),36);
 assert.equal(by(r,"optimism"),22);
 assert.equal(by(r,"negative_emotions"),31);
});
test("reversing the direction of item 28 changes optimism and general index",()=>{
 const a=scoreQlesq(make(()=>5)),b=scoreQlesq(make(n=>n===28?6:5));
 assert.equal(by(b,"optimism"),by(a,"optimism")-1);
 assert.equal(by(b,"quality_of_life_total"),by(a,"quality_of_life_total")-1);
});
test("order independence and allowed only complete integer responses",()=>{
 const input=make(n=>n%10+1),r=scoreQlesq(input);
 assert.equal(r.status,"scored");assert.deepEqual(scoreQlesq({...input,responses:[...input.responses].reverse()}).measures,r.measures);
 for(const bad of ["0","11","3.5","NaN","3e0"," 5",""]){
  const x=structuredClone(input);x.responses[0].value=bad;assert.equal(scoreQlesq(x).status,"invalid",bad);
 }
 const missing=structuredClone(input);missing.responses.pop();assert.equal(scoreQlesq(missing).status,"invalid");
 const duplicate=structuredClone(input);duplicate.responses[0]=duplicate.responses[1];assert.equal(scoreQlesq(duplicate).status,"invalid");
 const extra=structuredClone(input);extra.responses.push({item_id:"q37",value:"5"});assert.equal(scoreQlesq(extra).status,"invalid");
});
test("no scientific or legal publication approval inferred",()=>{
 const r=scoreQlesq(make(()=>5));
 assert.equal(r.warnings[0].code,"DRAFT_RESEARCH_ONLY");
 assert.equal(r.warnings[0].details.scientific_approval,false);
 assert.equal(r.warnings[0].details.legal_approval,false);
});
