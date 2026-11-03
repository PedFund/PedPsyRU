'use strict';
const {createHash}=require('node:crypto'),{entries}=require('../core/legacy-batch-data.js'),{canonicalJson}=require('./releases.js');
const sha=s=>'sha256:'+createHash('sha256').update(s).digest('hex');
function legacyBatchReleases(){return entries.map(m=>{
 if(sha(JSON.stringify(m.key))!==m.pins.key||sha(canonicalJson(m.form))!==m.pins.form||m.form.items.length!==m.itemCount||m.form.items.some((item,i)=>item.id!=='q'+String(i+1).padStart(2,'0')||item.number!==i+1||typeof item.text!=='string'||!item.text.trim()||item.options.length!==m.valid.length||item.options.some((o,j)=>o.value!==m.valid[j]||typeof o.text!=='string'||!o.text.trim())))throw Error('BATCH_PACKAGE_CHANGED');
 return {...m,formSnapshot:canonicalJson(m.form),formDigest:m.pins.form,keyDigest:m.pins.key,methodVersionId:m.id+'@1.0.0-local',handlerVersion:'legacy-numeric-1.0.0',verificationState:'legacy_checked'};
});}
module.exports={legacyBatchReleases};
