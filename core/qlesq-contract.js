"use strict";
const {createHash}=require("node:crypto");
const key=require("../methods/qlesq/keys/1.0.0-draft.json");
const CONTRACT_VERSION="1.0",METHOD_VERSION_ID="qlesq_36_vodopyanova@1.0.0-draft",HANDLER_VERSION="qlesq-draft-1.0.0";
const KEY_DIGEST="sha256:"+createHash("sha256").update(JSON.stringify(key)).digest("hex");
const expected=new Set(Array.from({length:36},(_,i)=>"q"+String(i+1).padStart(2,"0")));
function scoreQlesq(input){
 const result={contract_version:CONTRACT_VERSION,method_version_id:METHOD_VERSION_ID,handler_version:HANDLER_VERSION,status:"invalid",
 validation_state:"key_verified",quality:{valid_response_count:0,complete:false,usable_for_aggregation:false},measures:[],classifications:[],warnings:[],
 calculation:{algorithm_id:HANDLER_VERSION,key_digest:KEY_DIGEST}};
 const invalid=()=>{result.warnings=[{code:"INVALID_RESPONSES",severity:"error",details:{}}];return result;};
 if(!input||typeof input!=="object"||Array.isArray(input)||Object.keys(input).sort().join(",")!=="contract_version,handler_version,method_version_id,responses"||
 input.contract_version!==CONTRACT_VERSION||input.handler_version!==HANDLER_VERSION||input.method_version_id!==METHOD_VERSION_ID||
 !Array.isArray(input.responses)||input.responses.length!==36)return invalid();
 const answers=new Map();
 for(const r of input.responses){
   if(!r||typeof r!=="object"||Array.isArray(r)||Object.keys(r).sort().join(",")!=="item_id,value"||
   typeof r.item_id!=="string"||!expected.has(r.item_id)||answers.has(r.item_id)||
   typeof r.value!=="string"||!key.values.includes(r.value))return invalid();
   answers.set(r.item_id,Number(r.value));
 }
 if(answers.size!==36)return invalid();
 const at=n=>{const v=answers.get("q"+String(n).padStart(2,"0"));return key.reverse.includes(n)?11-v:v;};
 let total=0;
 for(const s of key.scales){
   const value=s.items.reduce((acc,n)=>acc+at(n),0);
   if(value<4||value>40)return invalid();
   total+=value;
   result.measures.push({code:s.id,label:s.label,value,value_type:"number",representation:"raw",precision:0});
   result.measures.push({code:s.id+"_percent",label:s.label+" (%)",value:(value-4)/36*100,value_type:"number",representation:"percent",precision:2});
 }
 const index=total/9,percent=(index-4)/36*100;
 result.measures.push({code:"quality_of_life_index",label:"Интегральный индекс качества жизни",value:index,value_type:"number",representation:"raw",precision:2});
 result.measures.push({code:"quality_of_life_total",label:"Суммарный скорректированный балл",value:total,value_type:"number",representation:"raw",precision:0});
 result.measures.push({code:"quality_of_life_percent",label:"Нормированный индекс (%)",value:percent,value_type:"number",representation:"percent",precision:2});
 const level=key.levels.find(x=>index<x.max_exclusive);
 if(!level)return invalid();
 result.classifications.push({code:"quality_of_life_level",label:"Уровень качества жизни",value:level.label,basis:"draft_2005_integral_index_intervals"});
 result.status="scored";result.quality={valid_response_count:36,complete:true,usable_for_aggregation:true};
 result.warnings=[{code:"DRAFT_RESEARCH_ONLY",severity:"warning",details:{publication:"draft",scientific_approval:false,legal_approval:false}}];
 return result;
}
module.exports={scoreQlesq,CONTRACT_VERSION,METHOD_VERSION_ID,HANDLER_VERSION,KEY_DIGEST};
