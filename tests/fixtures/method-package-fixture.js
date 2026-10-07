"use strict";
// Entirely synthetic metadata, no source text/key/norms or clinical records.
module.exports=function packageFixture(){return {
 schema_version:"1.0",method_id:"synthetic_sum",package_version:"0.1.0",title:"Учебный пакет",language:"ru",
 provenance:{origin:"owner_materials",sources:[{id:"synthetic_source",citation:"Synthetic hand calculation: 1 + 2 = 3",url:null}],missing:[]},
 rights:{status:"unknown",source_ids:[]},instruction:{artifact_id:"instruction"},form:{artifact_id:"form",version:"0.1.0"},
 items:[{id:"q01",ordinal:1,kind:"integer",min:0,max:5},{id:"q02",ordinal:2,kind:"integer",min:0,max:5}],
 scales:[{id:"total",label:"Учебная сумма",min:0,max:10,direction:"not_specified"}],
 calculation:{kind:"sum",adapter_id:"synthetic_sum",adapter_version:"0.1.0",specification_artifact_id:"specification",key_artifact_id:null},
 norms:{status:"absent",artifact_id:null,applicability_artifact_id:null,source_ids:[]},
 control_vectors:[{id:"hand_sum",data_origin:"synthetic",responses:[{item_id:"q01",value:1},{item_id:"q02",value:2}],expected:[{scale_id:"total",value:3}],basis:{kind:"independent",source_ids:["synthetic_source"]}}],
 artifacts:[{id:"instruction",path:"instruction.md",bytes:10,sha256:"a".repeat(64),media_type:"text/markdown"},{id:"form",path:"form.json",bytes:10,sha256:"b".repeat(64),media_type:"application/json"},{id:"specification",path:"specification.md",bytes:10,sha256:"c".repeat(64),media_type:"text/markdown"}],
 review:{technical:"unverified",scientific:"draft",publication:"draft"}
};};
