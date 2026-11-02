"use strict";
const {createHash}=require('node:crypto'),key=require('../methods/karpov/keys/1.0.0-local.json');
const CONTRACT_VERSION='1.0',METHOD_VERSION_ID='reflexivity_karpov_27@1.0.0-local',HANDLER_VERSION='karpov-local-1.0.0';
const KEY_DIGEST='sha256:'+createHash('sha256').update(JSON.stringify(key)).digest('hex');
function scoreKarpov(input){
 const result={contract_version:CONTRACT_VERSION,method_version_id:METHOD_VERSION_ID,handler_version:HANDLER_VERSION,status:'invalid',validation_state:'legacy_checked',quality:{valid_response_count:0,complete:false,usable_for_aggregation:false},measures:[],classifications:[],warnings:[],calculation:{algorithm_id:HANDLER_VERSION,key_digest:KEY_DIGEST}};
 const invalid=()=>{result.warnings=[{code:'INVALID_RESPONSES',severity:'error',details:{}}];return result;};
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).sort().join(',')!=='contract_version,handler_version,method_version_id,responses'||input.contract_version!==CONTRACT_VERSION||input.method_version_id!==METHOD_VERSION_ID||input.handler_version!==HANDLER_VERSION||!Array.isArray(input.responses)||input.responses.length!==27)return invalid();
 const values=new Map();for(const r of input.responses){if(!r||typeof r!=='object'||Array.isArray(r)||Object.keys(r).sort().join(',')!=='item_id,value'||!/^q(?:0[1-9]|1[0-9]|2[0-7])$/.test(r.item_id)||typeof r.value!=='string'||!(/^[1-7]$/).test(r.value)||values.has(r.item_id))return invalid();values.set(r.item_id,Number(r.value));}
 const at=n=>values.get('q'+String(n).padStart(2,'0'));
 const raw=key.scales['Рефлексивность'].direct.reduce((s,n)=>s+at(n),0)+key.scales['Рефлексивность'].reverse.reduce((s,n)=>s+8-at(n),0);
 const row=key.stenTable.find(([lo,hi])=>(lo===null||raw>=lo)&&(hi===null||raw<=hi));if(!row||!Number.isInteger(raw)||raw<27||raw>189)return invalid();
 const sten=row[2],level=sten<4?'низкий':sten<7?'средний':'высокий';
 result.status='scored';result.quality={valid_response_count:27,complete:true,usable_for_aggregation:true};
 result.measures=[{code:'reflexivity',label:'Рефлексивность',value:raw,value_type:'number',representation:'raw',precision:0},{code:'reflexivity_sten',label:'Рефлексивность — стен',value:sten,value_type:'number',representation:'sten',precision:0}];
 result.classifications=[{code:'reflexivity_level',label:'Уровень рефлексивности',value:level,basis:'legacy_sten_table'}];
 result.warnings=[{code:'LEGACY_NORMS_RESEARCH_ONLY',severity:'warning',details:{basis:'owner_existing_processor',scientific_approval:false,publication:'draft'}}];return result;
}
module.exports={scoreKarpov,CONTRACT_VERSION,METHOD_VERSION_ID,HANDLER_VERSION,KEY_DIGEST};
