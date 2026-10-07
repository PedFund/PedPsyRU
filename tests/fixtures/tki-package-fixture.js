"use strict";
const fs=require("node:fs"),crypto=require("node:crypto"),form=require("../../methods/tki/form.json");
module.exports=function tkiFixture(){
 const codes=["competing","collaborating","compromising","avoiding","accommodating"],labels=["Соперничество","Сотрудничество","Компромисс","Избегание","Приспособление"];
 const contents=[{id:"form",path:"form.json",bytes:fs.readFileSync("methods/tki/form.json")},{id:"key",path:"key.json",bytes:fs.readFileSync("methods/tki/keys/1.0.0.json")},{id:"instruction",path:"instruction.txt",bytes:Buffer.from(form.instruction)},{id:"specification",path:"specification.txt",bytes:Buffer.from("Existing TKI raw handler, pinned verified key1.0.0, no norms.")}];
 const pkg={schema_version:"1.0",method_id:"tki_ru_30_pairs",package_version:"1.0.0",title:form.title,language:form.language,
 provenance:{origin:"existing_processor",sources:[{id:"regression",citation:"Existing synthetic TKI control vectors, not independent scientific proof",url:null}],missing:["rights"]},rights:{status:"unknown",source_ids:[]},instruction:{artifact_id:"instruction"},form:{artifact_id:"form",version:form.version},
 items:form.items.map(x=>({id:x.id,ordinal:x.number,kind:"single_choice",options:x.options.map(o=>({value:o.value,label:o.text}))})),scales:codes.map((id,i)=>({id,label:labels[i],min:0,max:12,direction:"not_specified"})),
 calculation:{kind:"forced_choice",adapter_id:"tki-contract",adapter_version:"0.3.0",specification_artifact_id:"specification",key_artifact_id:"key"},norms:{status:"absent",artifact_id:null,applicability_artifact_id:null,source_ids:[]},
 control_vectors:[["all_a",()=>"A",[6,6,6,6,6]],["all_b",()=>"B",[6,6,6,6,6]],["alternating",i=>i%2?"B":"A",[7,9,7,4,3]]].map(([id,answer,values])=>({id,data_origin:"synthetic",responses:form.items.map((x,i)=>({item_id:x.id,value:answer(i)})),expected:codes.map((scale_id,i)=>({scale_id,value:values[i]})),basis:{kind:"legacy_regression",source_ids:["regression"]}})),
 artifacts:contents.map(x=>({id:x.id,path:x.path,bytes:x.bytes.length,sha256:crypto.createHash("sha256").update(x.bytes).digest("hex"),media_type:x.path.endsWith(".json")?"application/json":"text/plain"})),review:{technical:"unverified",scientific:"draft",publication:"draft"}};
 return {pkg,contents};
};
