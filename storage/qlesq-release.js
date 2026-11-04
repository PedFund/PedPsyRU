"use strict";
const {createHash}=require("node:crypto");
const form=require("../methods/qlesq/form-local.json");
const source=require("../methods/qlesq/source/1.0.0.json");
const key=require("../methods/qlesq/keys/1.0.0-draft.json");
const {canonicalJson}=require("./releases.js");
const {KEY_DIGEST,METHOD_VERSION_ID,HANDLER_VERSION}=require("../core/qlesq-contract.js");
const sha=s=>"sha256:"+createHash("sha256").update(s).digest("hex");
function qlesqReleasePackage(){
 const ids=new Set();
 if(sha(JSON.stringify(key))!==KEY_DIGEST||form.method_id!=="qlesq_36_vodopyanova"||form.items.length!==36||source.items.length!==36||
   source.scoring.reverse_items.join(",")!==key.reverse.join(",")||key.scales.length!==9||
   form.items.some((item,i)=>{
     const src=source.items[i];if(item.id!=="q"+String(i+1).padStart(2,"0")||item.number!==i+1||item.text!==src.title||ids.has(item.id))return true;ids.add(item.id);
     return item.options.length!==10||item.options.some((o,j)=>o.value!==String(j+1)||typeof o.text!=="string"||!o.text.trim())||
     item.options[0].text!==("1 – "+src.anchor_1)||item.options[9].text!==("10 – "+src.anchor_10);
   }))throw Error("QLESQ_PACKAGE_CHANGED");
 return {form,formSnapshot:canonicalJson(form),formDigest:sha(canonicalJson(form)),keyDigest:KEY_DIGEST,methodVersionId:METHOD_VERSION_ID,handlerVersion:HANDLER_VERSION,verificationState:"key_verified"};
}
module.exports={qlesqReleasePackage};
