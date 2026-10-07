"use strict";
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const form=require("../../methods/karpov/form.json"),key=require("../../methods/karpov/keys/0.1.0-draft.json");
// A synthetic draft fixture, NOT a registered or scientifically approved release.
module.exports=function karpovFixture(){
 const texts=[{id:"instruction",path:"instruction.txt",bytes:Buffer.from(form.instruction),media_type:"text/plain"},{id:"form",path:"form.json",bytes:fs.readFileSync(path.join(__dirname,"../../methods/karpov/form.json")),media_type:"application/json"},{id:"key",path:"key.json",bytes:fs.readFileSync(path.join(__dirname,"../../methods/karpov/keys/0.1.0-draft.json")),media_type:"application/json"},{id:"specification",path:"specification.txt",bytes:Buffer.from("Legacy raw sum only. Reverse items: 8 minus answer. All 27 answers must be integers 1..7. Norms, stens and levels are not imported."),media_type:"text/plain"}];
 const direct=new Set(key.scales["Рефлексивность"].direct);
 const cases=[["all_1",Array(27).fill(1),99],["all_7",Array(27).fill(7),117],["all_4",Array(27).fill(4),108],["minimum",form.items.map(x=>direct.has(x.number)?1:7),27],["maximum",form.items.map(x=>direct.has(x.number)?7:1),189]];
 const pkg={schema_version:"1.0",method_id:key.id,package_version:"0.1.0",title:form.title,language:"ru",
 provenance:{origin:"owner_materials",sources:[{id:"owner_form",citation:"Owner-provided 27 statements and seven answer labels, 2026-10-07",url:form.provenance.reference_urls[0]},{id:"legacy_raw",citation:"Existing processor raw key/control regression, not independent primary verification",url:key.provenance.legacy_reference_url}],missing:["instruction","rights"]},
 rights:{status:"unknown",source_ids:[]},instruction:{artifact_id:"instruction"},form:{artifact_id:"form",version:form.version},items:form.items.map(x=>({id:x.id,ordinal:x.number,kind:"integer",min:1,max:7})),
 scales:[{id:"reflexivity",label:"Рефлексивность",min:27,max:189,direction:"not_specified"}],calculation:{kind:"reverse_sum",adapter_id:null,adapter_version:null,specification_artifact_id:"specification",key_artifact_id:"key"},
 norms:{status:"absent",artifact_id:null,applicability_artifact_id:null,source_ids:[]},control_vectors:cases.map(([id,values,value])=>({id,data_origin:"synthetic",responses:form.items.map((x,i)=>({item_id:x.id,value:values[i]})),expected:[{scale_id:"reflexivity",value}],basis:{kind:"legacy_regression",source_ids:["legacy_raw"]}})),
 artifacts:texts.map(x=>({id:x.id,path:x.path,bytes:x.bytes.length,sha256:crypto.createHash("sha256").update(x.bytes).digest("hex"),media_type:x.media_type})),review:{technical:"unverified",scientific:"draft",publication:"draft"}};
 return {pkg,contents:texts.map(({id,path,bytes})=>({id,path,bytes}))};
};
