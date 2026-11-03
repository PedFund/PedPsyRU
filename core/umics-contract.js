'use strict';
const {createHash}=require('node:crypto');
const key=require('../methods/umics/key-local.json'),pins=require('../methods/umics/pins.json');
const {scoreNumericPassport}=require('./numeric-passport.js');
const CONTRACT_VERSION='1.0',METHOD_VERSION_ID='umics_pi_ru_13@1.0.0-local',HANDLER_VERSION='umics-local-1.0.0';
const KEY_DIGEST='sha256:'+createHash('sha256').update(JSON.stringify(key)).digest('hex');
const definitions=[['commitment_sum','Обязательство – сумма'],['commitment_mean','Обязательство – среднее'],['exploration_sum','Углубленное исследование – сумма'],['exploration_mean','Углубленное исследование – среднее'],['reconsideration_sum','Пересмотр обязательства – сумма'],['reconsideration_mean','Пересмотр обязательства – среднее']];
function scoreUmics(input){
 const result={contract_version:CONTRACT_VERSION,method_version_id:METHOD_VERSION_ID,handler_version:HANDLER_VERSION,status:'invalid',validation_state:'legacy_checked',quality:{valid_response_count:0,complete:false,usable_for_aggregation:false},measures:[],classifications:[],warnings:[],calculation:{algorithm_id:HANDLER_VERSION,key_digest:KEY_DIGEST}};
 const invalid=()=>{result.warnings=[{code:'INVALID_RESPONSES',severity:'error',details:{}}];return result;};
 if(KEY_DIGEST!==pins.key||!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).sort().join(',')!=='contract_version,handler_version,method_version_id,responses'||input.contract_version!==CONTRACT_VERSION||input.method_version_id!==METHOD_VERSION_ID||input.handler_version!==HANDLER_VERSION||!Array.isArray(input.responses)||input.responses.length!==13)return invalid();
 const values=new Map();for(const r of input.responses){if(!r||typeof r!=='object'||Array.isArray(r)||Object.keys(r).sort().join(',')!=='item_id,value'||!/^q(?:0[1-9]|1[0-3])$/.test(r.item_id)||typeof r.value!=='string'||!/^[1-5]$/.test(r.value)||values.has(r.item_id))return invalid();values.set(r.item_id,Number(r.value));}
 const answers=Array.from({length:13},(_,i)=>values.get('q'+String(i+1).padStart(2,'0')));let scored;
 try{scored=scoreNumericPassport(key,answers);}catch{return invalid();}
 for(const [code,label] of definitions){const value=scored.metrics[label];if(!Number.isFinite(value))return invalid();result.measures.push({code,label,value,value_type:'number',representation:'raw',precision:code.endsWith('_sum')?0:2});}
 result.status='scored';result.quality={valid_response_count:13,complete:true,usable_for_aggregation:true};result.warnings=[{code:'LEGACY_DRAFT_RESEARCH_ONLY',severity:'warning',details:{basis:'owner_existing_processor',scientific_approval:false,publication:'draft'}}];return result;
}
module.exports={scoreUmics,CONTRACT_VERSION,METHOD_VERSION_ID,HANDLER_VERSION,KEY_DIGEST};
