'use strict';
const {createHash}=require('node:crypto'),{entries}=require('./legacy-batch-data.js'),{scoreNumericPassport}=require('./numeric-passport.js');
const CONTRACT_VERSION='1.0',HANDLER_VERSION='legacy-numeric-1.0.0';
const sha=s=>'sha256:'+createHash('sha256').update(s).digest('hex');
function scoreLegacyNumeric(input){
 const method=input&&typeof input.method_version_id==='string'?entries.find(x=>x.id+'@1.0.0-local'===input.method_version_id):null;
 const result={contract_version:CONTRACT_VERSION,method_version_id:method?method.id+'@1.0.0-local':'',handler_version:HANDLER_VERSION,status:'invalid',validation_state:'legacy_checked',quality:{valid_response_count:0,complete:false,usable_for_aggregation:false},measures:[],classifications:[],warnings:[],calculation:{algorithm_id:HANDLER_VERSION,key_digest:method?method.pins.key:''}};
 const invalid=()=>{result.warnings=[{code:'INVALID_RESPONSES',severity:'error',details:{}}];return result;};
 if(!method||sha(JSON.stringify(method.key))!==method.pins.key||!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).sort().join(',')!=='contract_version,handler_version,method_version_id,responses'||input.contract_version!==CONTRACT_VERSION||input.handler_version!==HANDLER_VERSION||!Array.isArray(input.responses)||input.responses.length!==method.itemCount)return invalid();
 const values=new Map();for(const r of input.responses){const index=typeof r?.item_id==='string'?Number(r.item_id.slice(1)):NaN;if(!r||typeof r!=='object'||Array.isArray(r)||Object.keys(r).sort().join(',')!=='item_id,value'||!Number.isInteger(index)||index<1||index>method.itemCount||r.item_id!=='q'+String(index).padStart(2,'0')||typeof r.value!=='string'||!method.valid.includes(r.value)||values.has(r.item_id)||!method.form.items[index-1].options.some(o=>o.value===r.value))return invalid();values.set(r.item_id,Number(r.value));}
 const answers=Array.from({length:method.itemCount},(_,i)=>values.get('q'+String(i+1).padStart(2,'0')));let scored;try{scored=scoreNumericPassport(method.key,answers);}catch{return invalid();}
 for(const output of method.outputs){const value=scored.metrics[output.label];if(!Number.isFinite(value))return invalid();result.measures.push({code:output.id,label:output.label,value,value_type:'number',representation:'raw',precision:2});
  const norm=scored.metrics[output.label+' – станайн'];if(Number.isFinite(norm))result.measures.push({code:output.id+'_stanine',label:output.label+' – станайн',value:norm,value_type:'number',representation:'stanine',precision:0});
  const criterion=scored.metrics[output.label+' – относительно cut-off'];if(typeof criterion==='string')result.classifications.push({code:output.id+'_criterion',label:output.label+' – относительно cut-off',value:criterion,basis:'owner_processor_criterion'});
  const threshold=scored.metrics[output.label+' – относительно критерия'];if(typeof threshold==='string')result.classifications.push({code:output.id+'_criterion',label:output.label+' – относительно критерия',value:threshold,basis:'owner_processor_criterion'});
 }
 result.status='scored';result.quality={valid_response_count:method.itemCount,complete:true,usable_for_aggregation:true};result.warnings=[{code:'LEGACY_DRAFT_RESEARCH_ONLY',severity:'warning',details:{basis:'owner_existing_processor',scientific_approval:false,publication:'draft'}}];if(scored.warnings.length)result.warnings.push({code:'AMBIGUOUS_NORMS',severity:'warning',details:{}});return result;
}
module.exports={scoreLegacyNumeric,CONTRACT_VERSION,HANDLER_VERSION};
