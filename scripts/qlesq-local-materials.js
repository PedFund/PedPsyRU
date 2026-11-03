"use strict";
const {readFileSync}=require("node:fs");
const {resolve}=require("node:path");
const {createHash}=require("node:crypto");
const form=require("../methods/qlesq/form-local.json");
const source=require("../methods/qlesq/source/1.0.0.json");
const key=require("../methods/qlesq/keys/1.0.0-draft.json");
function qlesqLocalMaterials(){
 const load=file=>readFileSync(resolve(__dirname,"../methods/qlesq/"+file));
 const instruction=Buffer.from(source.instructions+"\n","utf8");
 const specification=Buffer.from("Q-LES-Q 36, N. E. Vodopyanova (2005). Nine four-item scale sums, reversal 21,28,33,35 as 11-x; integral index is the average of the nine sums, 4–40. Publication: draft only.\n","utf8");
 const contents=[{id:"form",path:"form.json",bytes:load("form-local.json")},{id:"key",path:"key.json",bytes:load("keys/1.0.0-draft.json")},{id:"instruction",path:"instruction.txt",bytes:instruction},{id:"specification",path:"specification.txt",bytes:specification}];
 const sha=b=>createHash("sha256").update(b).digest("hex");
 const items=form.items.map(i=>({id:i.id,ordinal:i.number,kind:"single_choice",options:i.options.map(o=>({value:o.value,label:o.text}))}));
 const scales=key.scales.map(s=>({id:s.id,label:s.label,min:4,max:40,direction:"higher"}));
 scales.push({id:"quality_of_life_index",label:"Интегральный индекс качества жизни",min:4,max:40,direction:"higher"});
 const expectedFor=n=>{
 const at=i=>key.reverse.includes(i)?11-n:n;
 return [...key.scales.map(s=>({scale_id:s.id,value:s.items.reduce((sum,id)=>sum+at(id),0)})),{scale_id:"quality_of_life_index",value:key.scales.reduce((sum,s)=>sum+s.items.reduce((a,id)=>a+at(id),0),0)/9}];
 };
 const vectors=[1,10].map((n,j)=>({id:j?"all_max":"all_min",data_origin:"synthetic",responses:form.items.map(i=>({item_id:i.id,value:String(n)})),expected:expectedFor(n),basis:{kind:"independent",source_ids:["nikiforov_2005"]}}));
 const pkg={schema_version:"1.0",method_id:form.method_id,package_version:"1.0.0",title:form.title,language:form.language,
 provenance:{origin:"owner_supplied",sources:[{id:"nikiforov_2005",citation:"Г. С. Никифоров (ред.). Практикум по психологии здоровья. 2005, приложение 21.1",url:"https://studfile.net/preview/8837964/"}],missing:["rights"]},
 rights:{status:"unknown",source_ids:[]},instruction:{artifact_id:"instruction"},form:{artifact_id:"form",version:form.version},items,scales,
 calculation:{kind:"special",adapter_id:"qlesq-draft",adapter_version:"1.0.0",specification_artifact_id:"specification",key_artifact_id:"key"},
 norms:{status:"absent",artifact_id:null,applicability_artifact_id:null,source_ids:[]},
 control_vectors:vectors,artifacts:contents.map(a=>({id:a.id,path:a.path,bytes:a.bytes.length,sha256:sha(a.bytes),media_type:a.path.endsWith(".json")?"application/json":"text/plain"})),
 review:{technical:"unverified",scientific:"draft",publication:"draft"}};
 if(source.items.length!==36||key.scales.length!==9)throw Error("QLESQ_SOURCE_CHANGED");
 return {pkg,contents};
}
module.exports={qlesqLocalMaterials};
