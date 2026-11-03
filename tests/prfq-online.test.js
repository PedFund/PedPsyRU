"use strict";
const {test}=require('node:test'),assert=require('node:assert/strict');
const core=require('../core/prfq-contract.js'),key=require('../methods/prfq/key-local.json'),form=require('../methods/prfq/form-local.json');
const request=values=>({contract_version:core.CONTRACT_VERSION,method_version_id:core.METHOD_VERSION_ID,handler_version:core.HANDLER_VERSION,responses:values.map((v,i)=>({item_id:'q'+String(i+1).padStart(2,'0'),value:String(v)}))});
test('PRFQ-RU-16 matches author key and calculates three means, three stanines and separate levels',()=>{
 assert.deepEqual(key.scales['Предрефлексия'].items,[1,4,7,10,13]);assert.deepEqual(key.scales['Уверенность'].reverse,[11]);assert.equal(form.items.length,16);
 for(const [value,expected] of [[1,[1,1,2,1,1,1]],[4,[4,8,4,5,4,2]],[7,[7,9,6,9,7,9]]]){const result=core.scorePrfq(request(Array(16).fill(value)));assert.equal(result.status,'scored');assert.deepEqual(result.measures.map(m=>m.value),expected);assert.equal(result.classifications.length,3);assert.equal(result.warnings[0].details.scientific_approval,false);}
 const answers=Array(16).fill(4);answers[10]=1;assert.equal(core.scorePrfq(request(answers)).measures[2].value,4.5);answers[10]=7;assert.equal(core.scorePrfq(request(answers)).measures[2].value,3.5);
});
test('PRFQ rejects wrong response sets, other versions and unrecognized answer tokens',()=>{
 const good=request(Array(16).fill(4));for(const edit of [r=>r.responses.pop(),r=>r.responses[0].value=4,r=>r.responses[0].value='8',r=>r.responses[0].value='A',r=>r.responses[1].item_id='q01',r=>r.responses[0].item_id='q17',r=>r.handler_version='old',r=>r.extra=true]){const value=structuredClone(good);edit(value);assert.equal(core.scorePrfq(value).status,'invalid');}
});
test('PRFQ pinned package verifies actual immutable artifacts and synthetic control vectors',async()=>{
 const {prfqLocalMaterials}=require('../scripts/prfq-local-materials.js'),{prepareMethodDraft}=require('../dist/src/application/method-library.js'),{ScopedMemoryMethodArtifacts}=require('../dist/src/adapters/memory/method-artifacts.js'),{methodPackageHasher}=require('../dist/src/adapters/method-package-crypto.js'),{pinnedPrfqMethodHandler}=require('../dist/src/adapters/pinned-prfq-handler.js');const x=prfqLocalMaterials(),r=await prepareMethodDraft(JSON.stringify(x.pkg),new ScopedMemoryMethodArtifacts(x.pkg.method_id,x.pkg.package_version,x.contents),methodPackageHasher(),pinnedPrfqMethodHandler());assert.equal(r.verification.handler.state,'pinned');assert.equal(r.verification.handler.checked_vectors.length,3);assert.equal(r.verification.publishable,false);
});
