"use strict";
const {createHash}=require('node:crypto'),form=require('../methods/karpov/form-local.json'),key=require('../methods/karpov/keys/1.0.0-local.json');
const {canonicalJson}=require('./releases.js'),{KEY_DIGEST,METHOD_VERSION_ID,HANDLER_VERSION}=require('../core/karpov-contract.js');
const sha=value=>'sha256:'+createHash('sha256').update(value).digest('hex');
function karpovReleasePackage(){
 if(sha(JSON.stringify(key))!==KEY_DIGEST||form.method_id!=='reflexivity_karpov_27'||form.items.length!==27||form.items.some((item,i)=>item.id!=='q'+String(i+1).padStart(2,'0')||item.number!==i+1||typeof item.text!=='string'||!item.text.trim()||item.options.length!==7||item.options.some((o,j)=>o.value!==String(j+1)||typeof o.text!=='string'||!o.text.trim())))throw Error('KARPOV_PACKAGE_CHANGED');
 return {form,formSnapshot:canonicalJson(form),formDigest:sha(canonicalJson(form)),keyDigest:KEY_DIGEST,methodVersionId:METHOD_VERSION_ID,handlerVersion:HANDLER_VERSION,verificationState:'legacy_checked'};
}
module.exports={karpovReleasePackage};
