'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const core=require('../core/umics-contract.js'),key=require('../methods/umics/key-local.json'),form=require('../methods/umics/form-local.json');
const request=values=>({contract_version:core.CONTRACT_VERSION,method_version_id:core.METHOD_VERSION_ID,handler_version:core.HANDLER_VERSION,responses:values.map((v,i)=>({item_id:'q'+String(i+1).padStart(2,'0'),value:String(v)}))});
test('U-MICS-PI draft computes three sums and means without total or normative levels',()=>{
 assert.deepEqual(key.scales['Обязательство – сумма'].items,[1,2,3,4,5]);assert.deepEqual(key.scales['Пересмотр обязательства – сумма'].items,[11,12,13]);assert.equal(form.items.length,13);
 for(const [value,expected] of [[1,[5,1,5,1,3,1]],[4,[20,4,20,4,12,4]],[5,[25,5,25,5,15,5]]]){const result=core.scoreUmics(request(Array(13).fill(value)));assert.equal(result.status,'scored');assert.deepEqual(result.measures.map(m=>m.value),expected);assert.equal(result.classifications.length,0);assert.equal(result.warnings[0].details.scientific_approval,false);}
 const answers=Array(13).fill(1);answers[12]=5;assert.equal(core.scoreUmics(request(answers)).measures[5].value,2.33);
});
test('U-MICS-PI rejects incomplete, duplicate, invalid and mismatched response sets',()=>{
 const good=request(Array(13).fill(4));for(const edit of [r=>r.responses.pop(),r=>r.responses[0].value=4,r=>r.responses[0].value='6',r=>r.responses[0].value='A',r=>r.responses[1].item_id='q01',r=>r.responses[0].item_id='q14',r=>r.handler_version='old',r=>r.extra=true]){const value=structuredClone(good);edit(value);assert.equal(core.scoreUmics(value).status,'invalid');}
});
test('U-MICS-PI pinned package checks actual artifacts and synthetic reference vectors',async()=>{
 const {umicsLocalMaterials}=require('../scripts/umics-local-materials.js'),{prepareMethodDraft}=require('../dist/src/application/method-library.js'),{ScopedMemoryMethodArtifacts}=require('../dist/src/adapters/memory/method-artifacts.js'),{methodPackageHasher}=require('../dist/src/adapters/method-package-crypto.js'),{pinnedUmicsMethodHandler}=require('../dist/src/adapters/pinned-umics-handler.js');const x=umicsLocalMaterials(),r=await prepareMethodDraft(JSON.stringify(x.pkg),new ScopedMemoryMethodArtifacts(x.pkg.method_id,x.pkg.package_version,x.contents),methodPackageHasher(),pinnedUmicsMethodHandler());assert.equal(r.verification.handler.state,'pinned');assert.equal(r.verification.handler.checked_vectors.length,3);assert.equal(r.verification.publishable,false);
});
