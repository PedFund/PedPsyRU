#!/usr/bin/env node
"use strict";
const fs=require("node:fs"),path=require("node:path");
const root=path.resolve(__dirname,".."),directory=path.join(root,"methods","validation","pilot-11");
const manifest=JSON.parse(fs.readFileSync(path.join(directory,"manifest.json"),"utf8"));
const contracts=JSON.parse(fs.readFileSync(path.join(directory,"scoring-contracts.json"),"utf8")).contracts;
const unique=a=>new Set(a).size===a.length;
const covered=(contract)=>{
  if(contract.direct)return [...contract.direct,...contract.reverse];
  return Object.values(contract.scales||{}).flatMap(scale=>Array.isArray(scale)?scale:[...scale.direct,...scale.reverse]);
};
function validate(){const errors=[];
  if(manifest.schema_version!=="1.0.0"||manifest.methods.length!==11)errors.push("MANIFEST_MUST_CONTAIN_11_METHODS");
  if(!unique(manifest.methods.map(x=>x.number))||manifest.methods.some((x,i)=>x.number!==i+1))errors.push("METHOD_NUMBERS_INVALID");
  if(!unique(manifest.methods.map(x=>x.method_id)))errors.push("DUPLICATE_METHOD_ID");
  if(!unique(contracts.map(x=>x.method_id)))errors.push("DUPLICATE_SCORING_CONTRACT");
  for(const method of manifest.methods){
    if(!/^\d+\.\d+\.\d+(?:-(?:draft|staging))?$/.test(method.package_version||""))errors.push(method.method_id+":PACKAGE_VERSION_INVALID");
    if(method.required_answer_count<method.item_count)errors.push(method.method_id+":ANSWER_COUNT_TOO_SMALL");
    for(const source of method.source_paths||[])if(!fs.existsSync(path.join(root,source)))errors.push(method.method_id+":MISSING_SOURCE:"+source);
    if(method.package_status==="blocked"&&!method.missing?.length)errors.push(method.method_id+":BLOCKER_NOT_DOCUMENTED");
  }
  for(const contract of contracts){
    const method=manifest.methods.find(x=>x.method_id===contract.method_id);if(!method){errors.push(contract.method_id+":NOT_IN_MANIFEST");continue;}
    if(contract.item_count!==method.item_count)errors.push(contract.method_id+":ITEM_COUNT_MISMATCH");
    if(!unique(contract.values)||contract.values.some(x=>!Number.isInteger(x)))errors.push(contract.method_id+":VALUES_INVALID");
    const all=covered(contract);if(all.length!==contract.item_count||!unique(all)||all.some((x,i)=>!Number.isInteger(x)||x<1||x>contract.item_count))errors.push(contract.method_id+":PRIMARY_KEY_COVERAGE_INVALID");
    for(const [id,items] of Object.entries(contract.scales||{})){const list=Array.isArray(items)?items:[...items.direct,...items.reverse];if(!unique(list))errors.push(contract.method_id+":"+id+":DUPLICATE_ITEM");}
  }
  return errors;
}
function responseMap(contract,responses){
  if(!Array.isArray(responses)||responses.length!==contract.item_count)throw Error("INCOMPLETE_RESPONSES");
  const out=new Map();responses.forEach((value,index)=>{if(!contract.values.includes(value))throw Error("INVALID_RESPONSE");out.set(index+1,value);});return out;
}
function level(rows,value){const row=rows?.find(([min,max,,mode])=>value>=min&&(mode==="max_exclusive"?value<max:value<=max));return row?.[2]||null;}
function score(contract,responses){const raw=responseMap(contract,responses);if(contract.quota){for(const [value,count] of Object.entries(contract.quota))if(responses.filter(x=>x===Number(value)).length!==count)throw Error("QUOTA_VIOLATION");}
  const normalized=new Map([...raw].map(([item,value])=>[item,contract.answer_map?contract.answer_map[String(value)]:(contract.reverse?.includes(item)?contract.reverse_max-value:value)]));
  const scales={};for(const [id,key] of Object.entries(contract.scales||{})){const values=Array.isArray(key)?key.map(item=>normalized.get(item)):[...key.direct.map(item=>raw.get(item)),...key.reverse.map(item=>contract.reverse_max-raw.get(item))];scales[id]=contract.scale_calculation==="mean"?values.reduce((a,b)=>a+b,0)/values.length:values.reduce((a,b)=>a+b,0);}
  for(const [id,parts] of Object.entries(contract.derived||{}))scales[id]=parts.reduce((sum,part)=>sum+scales[part],0);
  const levels={};for(const [id,rows] of Object.entries(contract.levels||{})){const value=id==="quality_of_life_index"?Object.values(scales).reduce((a,b)=>a+b,0)/Object.keys(scales).length:scales[id];levels[id]=level(rows,value);if(id==="quality_of_life_index")scales[id]=value;}
  if(contract.sten){const rawScore=scales.reflexivity,sten=contract.sten.find(([min,max])=>(min===null||rawScore>=min)&&(max===null||rawScore<=max))?.[2];scales.reflexivity_sten=sten;levels.reflexivity_sten=level(contract.sten_levels,sten);}
  if(contract.higher_order){for(const [id,parts] of Object.entries(contract.higher_order))scales[id]=parts.reduce((sum,part)=>sum+scales[part],0)/parts.length;}
  return {scales,levels};
}
if(require.main===module){const errors=validate();process.stdout.write(JSON.stringify({schema_version:"1.0.0",methods:manifest.methods.length,scoring_contracts:contracts.length,blocked_forms:manifest.methods.filter(x=>x.form_status==="awaiting_repository_source").map(x=>x.method_id),errors},null,2)+"\n");if(errors.length)process.exitCode=1;}
module.exports={manifest,contracts,validate,score,level};
