'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {calculatePinnedInstrument}=require('../dist/src/scoring/instruments.js');
const {builtinInstrumentRegistry}=require('../dist/src/scoring/builtin-instrument-modules.js');
const {createParticipationService}=require('../dist/src/application/participation.js');
const {maiaLegacyRelease}=require('../storage/maia-legacy-release.js');
const {entries,historicalEntries}=require('../core/approved-v1-data.js');
const historical=maiaLegacyRelease(),current=entries.find(entry=>entry.id==='maia_r_32');
const responses=value=>historical.form.items.map(item=>({item_id:item.id,value:String(value)}));
const request=(method,value)=>({contract_version:'1.0',method_version_id:method,handler_version:historical.handlerVersion,responses:responses(value)});

test('historical MAIA-R completes with its original pinned key and codes, alongside current 0..5',()=>{
  assert.equal(entries.some(entry=>entry.methodVersionId===historical.methodVersionId),false,'compatibility release is not a current catalog entry');
  assert.equal(historicalEntries.length,1);
  assert.equal(historicalEntries[0].pins.key,historical.keyDigest);
  const low=calculatePinnedInstrument(request(historical.methodVersionId,1));
  assert.equal(low.status,'scored');
  assert.equal(low.method_version_id,historical.methodVersionId);
  assert.equal(low.calculation.key_digest,historical.keyDigest);
  // Original pinned key: q8/q9 are reversed, q10 is direct. Keep its original
  // precision and result; this compatibility fix must not rewrite old norms.
  assert.deepEqual(low.measures.map(measure=>measure.value),[0,5,3.33,0,0,0,0,0]);
  const high=calculatePinnedInstrument(request(historical.methodVersionId,6));
  assert.deepEqual(high.measures.map(measure=>measure.value),[5,0,1.67,5,5,5,5,5]);
  for(let value=0;value<=5;value++){
    const old=calculatePinnedInstrument(request(historical.methodVersionId,value+1));
    const modern=calculatePinnedInstrument(request(current.methodVersionId,value));
    assert.deepEqual(old.measures,modern.measures,'the original answer map is applied exactly once');
    assert.deepEqual(old.classifications,modern.classifications);
    assert.notEqual(old.calculation.key_digest,modern.calculation.key_digest);
  }
});

test('historical and current MAIA-R reject cross-version codes and changed identities',()=>{
  assert.throws(()=>calculatePinnedInstrument(request(historical.methodVersionId,0)),/METHOD_INPUT_INCOMPLETE_OR_INVALID/);
  assert.throws(()=>calculatePinnedInstrument(request(current.methodVersionId,6)),/METHOD_INPUT_INCOMPLETE_OR_INVALID/);
  assert.throws(()=>calculatePinnedInstrument({...request(historical.methodVersionId,2),handler_version:'wrong'}),error=>error.code==='RELEASE_UNAVAILABLE');
  assert.throws(()=>calculatePinnedInstrument(request('maia_r_32@unknown',2)),error=>error.code==='RELEASE_UNAVAILABLE');
  const descriptor=builtinInstrumentRegistry.descriptors().find(item=>item.method_version_id===historical.methodVersionId);
  assert.throws(()=>builtinInstrumentRegistry.calculate({...descriptor,key_digest:'sha256:'+'0'.repeat(64)},request(historical.methodVersionId,2)),/METHOD_MODULE_UNAVAILABLE/);
});

function serviceFixture(keyDigest=historical.keyDigest){
  let state={id:'attempt',status:'draft',revision:31,releaseId:'historical',responses:responses(2)},stored=null,calculations=0,inserts=0;
  const ports={attempts:{getAuthorized:async()=>state,markCompleted:async()=>{state={...state,status:'completed',revision:32};}},
    releases:{getPinned:async()=>({contractVersion:'1.0',methodVersionId:historical.methodVersionId,handlerVersion:historical.handlerVersion,keyDigest,itemIds:historical.form.items.map(item=>item.id)})},
    results:{getExisting:async()=>stored,insertOnce:async result=>{inserts++;stored=result;return result;}},audit:{appendRequired:async()=>{}}};
  const uow={run:async(_,fn)=>fn(ports)};
  const service=createParticipationService(uow,{newId:()=> 'result',now:()=> '2026-11-24T00:00:00Z',digest:()=> 'synthetic-response-digest',score:input=>{calculations++;return calculatePinnedInstrument(input);}});
  return {service,state:()=>state,stored:()=>stored,calculations:()=>calculations,inserts:()=>inserts};
}

test('legacy MAIA-R service completes once, preserves responses and returns stored historical result without recalculation',async()=>{
  const f=serviceFixture(),original=structuredClone(f.state().responses);
  const result=await f.service.complete({},'attempt',{expected_revision:31});
  assert.equal(f.state().status,'completed');
  assert.equal(result.payload.method_version_id,historical.methodVersionId);
  assert.equal(result.payload.calculation.key_digest,historical.keyDigest);
  assert.deepEqual(f.state().responses,original,'stored 1..6 answers remain unchanged');
  for(const revision of [31,32,0])assert.deepEqual(await f.service.complete({},'attempt',{expected_revision:revision}),result);
  assert.deepEqual(await f.service.result({},'attempt'),result);
  assert.equal(f.calculations(),1);assert.equal(f.inserts(),1);
});

test('legacy MAIA-R service rejects a mismatched pinned key without saving a result',async()=>{
  const f=serviceFixture('sha256:'+'0'.repeat(64));
  await assert.rejects(f.service.complete({},'attempt',{expected_revision:31}),error=>error.code==='SCORING_REJECTED');
  assert.equal(f.state().status,'draft');assert.equal(f.inserts(),0);assert.equal(f.stored(),null);
});
