"use strict";
const {createHash}=require('node:crypto'),key=require('../methods/prfq/key-local.json');
const CONTRACT_VERSION='1.0',METHOD_VERSION_ID='prfq_ru_16_kamskaya_2023@1.0.0-local',HANDLER_VERSION='prfq-local-1.0.0';
const KEY_DIGEST='sha256:'+createHash('sha256').update(JSON.stringify(key)).digest('hex');
const definitions=[['prementalizing','Предрефлексия'],['certainty','Уверенность'],['interest','Интерес и любопытство']];
function scorePrfq(input){
 const result={contract_version:CONTRACT_VERSION,method_version_id:METHOD_VERSION_ID,handler_version:HANDLER_VERSION,status:'invalid',validation_state:'legacy_checked',quality:{valid_response_count:0,complete:false,usable_for_aggregation:false},measures:[],classifications:[],warnings:[],calculation:{algorithm_id:HANDLER_VERSION,key_digest:KEY_DIGEST}};
 const invalid=()=>{result.warnings=[{code:'INVALID_RESPONSES',severity:'error',details:{}}];return result;};
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).sort().join(',')!=='contract_version,handler_version,method_version_id,responses'||input.contract_version!==CONTRACT_VERSION||input.method_version_id!==METHOD_VERSION_ID||input.handler_version!==HANDLER_VERSION||!Array.isArray(input.responses)||input.responses.length!==16)return invalid();
 const values=new Map();for(const r of input.responses){if(!r||typeof r!=='object'||Array.isArray(r)||Object.keys(r).sort().join(',')!=='item_id,value'||!/^q(?:0[1-9]|1[0-6])$/.test(r.item_id)||typeof r.value!=='string'||!(/^[1-7]$/).test(r.value)||values.has(r.item_id))return invalid();values.set(r.item_id,Number(r.value));}
 const at=n=>values.get('q'+String(n).padStart(2,'0'));
 for(const [code,label] of definitions){const scale=key.scales[label],direct=scale.items||scale.direct,reverse=scale.reverse||[],scores=[...direct.map(at),...reverse.map(n=>key.reverseMax-at(n))],raw=Number((scores.reduce((a,b)=>a+b,0)/scores.length).toFixed(2)),norm=key.norms[label].ranges.find(([lo,hi])=>raw>=lo&&raw<=hi),level=key.levels[label].find(([lo,hi])=>raw>=lo&&raw<=hi);
  if(!Number.isFinite(raw)||!norm||!level)return invalid();
  result.measures.push({code,label,value:raw,value_type:'number',representation:'raw',precision:2},{code:code+'_stanine',label:label+' – станайн',value:norm[2],value_type:'number',representation:'stanine',precision:0});
  result.classifications.push({code:code+'_level',label:label+' – уровень',value:level[2],basis:'legacy_stanine_table'});
 }
 result.status='scored';result.quality={valid_response_count:16,complete:true,usable_for_aggregation:true};result.warnings=[{code:'LEGACY_NORMS_RESEARCH_ONLY',severity:'warning',details:{basis:'owner_existing_processor',scientific_approval:false,publication:'draft'}}];return result;
}
module.exports={scorePrfq,CONTRACT_VERSION,METHOD_VERSION_ID,HANDLER_VERSION,KEY_DIGEST};
