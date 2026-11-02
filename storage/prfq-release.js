"use strict";
const {createHash}=require('node:crypto'),form=require('../methods/prfq/form-local.json'),key=require('../methods/prfq/key-local.json');
const {canonicalJson}=require('./releases.js'),{KEY_DIGEST,METHOD_VERSION_ID,HANDLER_VERSION}=require('../core/prfq-contract.js'),pins=require('../methods/prfq/pins.json');
const sha=s=>'sha256:'+createHash('sha256').update(s).digest('hex');
function prfqReleasePackage(){
 if(sha(JSON.stringify(key))!==KEY_DIGEST||KEY_DIGEST!==pins.key||sha(canonicalJson(form))!==pins.form||form.method_id!=='prfq_ru_16_kamskaya_2023'||form.items.length!==16||form.items.some((item,i)=>item.id!=='q'+String(i+1).padStart(2,'0')||item.number!==i+1||typeof item.text!=='string'||!item.text.trim()||item.options.length!==7||item.options.some((o,j)=>o.value!==String(j+1)||typeof o.text!=='string'||!o.text.trim())))throw Error('PRFQ_PACKAGE_CHANGED');
 return {form,formSnapshot:canonicalJson(form),formDigest:pins.form,keyDigest:KEY_DIGEST,methodVersionId:METHOD_VERSION_ID,handlerVersion:HANDLER_VERSION,verificationState:'legacy_checked'};
}
module.exports={prfqReleasePackage};
