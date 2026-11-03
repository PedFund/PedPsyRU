"use strict";
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createMethodRuntimeRegistry,copyMethodData}=require('../dist/src/scoring/method-runtime.js');
const digest='sha256:'+'a'.repeat(64);
function moduleFor(id,check,calculate){return {descriptor:{contract_version:'2.0',method_version_id:'synthetic/'+id+'@1',handler_version:'test-1',key_digest:digest,title:'Synthetic '+id,authors:[],presentation:{id:'synthetic/'+id,version:'1'},response_schema:{id:'synthetic/'+id,version:'1'},result_schema:{id:'synthetic/output',version:'1'},outputs:[{id:'result',label:'Synthetic result',kind:'custom/'+id}]},
 checkDraft:data=>({valid:check(data),complete:check(data),issues:check(data)?[]:['INVALID']}),calculate,acceptsResult:r=>r&&typeof r==='object'&&['scored','pending_review'].includes(r.status),participantResult:r=>({status:r.status,result:r.result})};}

test('Open module protocol executes unrelated response/result structures, with no enum of test families',()=>{
 const cases=[
  [moduleFor('ranking',x=>Array.isArray(x)&&x.length===3&&new Set(x).size===3&&x.every(v=>['red','blue','green'].includes(v)),x=>({status:'scored',result:{first:x[0],ordered:x},private_key:'hidden'})),['blue','green','red'],{first:'blue',ordered:['blue','green','red']}],
  [moduleFor('timed-events',x=>Array.isArray(x?.events)&&x.events.length>0&&x.events.every(e=>Number.isFinite(e.ms)&&e.ms>=0),x=>({status:'scored',result:{times:x.events.map(e=>e.ms),count:x.events.length}})),{events:[{stimulus:'s1',ms:234,correct:true},{stimulus:'s2',ms:180,correct:false}]},{times:[234,180],count:2}],
  [moduleFor('matrix',x=>Array.isArray(x)&&x.length===2&&x.every(r=>Array.isArray(r)&&r.length===2&&r.every(Number.isFinite)),x=>({status:'scored',result:x.map(row=>row.reduce((a,b)=>a+b,0))})),[[1,2],[7,9]],[3,16]],
  [moduleFor('human-review',x=>x?.asset_ref==='synthetic:owned-asset'&&typeof x?.comment==='string',x=>({status:'pending_review',result:{submission:x.asset_ref,comment:x.comment},private_key:'hidden'})),{asset_ref:'synthetic:owned-asset',comment:'Synthetic drawing'},{submission:'synthetic:owned-asset',comment:'Synthetic drawing'}],
  [moduleFor('adaptive',x=>x?.state?.finished===true&&Array.isArray(x.responses)&&x.responses.length===x.state.visited.length,x=>({status:'scored',result:{path:x.state.visited,answers:x.responses}})),{state:{finished:true,visited:['intro','branch-b']},responses:[{text:'Synthetic answer'},{selected:['x','y'],confidence:0.8}]},{path:['intro','branch-b'],answers:[{text:'Synthetic answer'},{selected:['x','y'],confidence:0.8}]}]
 ];
 const registry=createMethodRuntimeRegistry(cases.map(x=>x[0]));assert.equal(registry.descriptors().length,5);
 for(const [module,input,expected] of cases){const before=structuredClone(input);assert.equal(registry.checkDraft(module.descriptor,input).complete,true);const result=registry.calculate(module.descriptor,input);assert.deepEqual(result.result,expected);assert.deepEqual(input,before);assert.equal(Object.isFrozen(result),true);assert.deepEqual(Object.keys(registry.participantResult(module.descriptor,result)).sort(),['result','status']);}
 assert.equal(registry.calculate(cases[3][0].descriptor,cases[3][1]).status,'pending_review');
 assert.throws(()=>registry.calculate(cases[0][0].descriptor,['red','red','green']),/INPUT_INCOMPLETE_OR_INVALID/);
});

test('Versioned modules fail closed: unknown/changed pins, duplicate bindings, mutated definitions and incorrect result',()=>{
 const m=moduleFor('custom-format-99',x=>typeof x==='string',x=>({status:'scored',result:x})),id=structuredClone(m.descriptor),registry=createMethodRuntimeRegistry([m]);
 m.descriptor.title='changed';m.calculate=()=>({status:'scored',result:'changed'});assert.equal(registry.describe(id).title,'Synthetic custom-format-99');assert.equal(registry.calculate(id,'original').result,'original');
 for(const field of ['contract_version','method_version_id','handler_version','key_digest'])assert.throws(()=>registry.calculate({...id,[field]:field==='key_digest'?'sha256:'+'b'.repeat(64):'unknown'},'input'),/UNAVAILABLE/);
 assert.throws(()=>createMethodRuntimeRegistry([m,m]),/DUPLICATE/);const changed=moduleFor('custom-format-99',()=>true,()=>({status:'bogus'}));assert.throws(()=>createMethodRuntimeRegistry([changed]).calculate(changed.descriptor,{}),/RESULT_REJECTED/);
 assert.throws(()=>registry.participantResult(id,{status:'bogus'}),/RESULT_REJECTED/);
});

test('Portable method data rejects executable/accessor/cyclic/oversized/nonfinite payloads and copies arbitrary nested values',()=>{
 const cyclic={};cyclic.self=cyclic;let invoked=false;const getter={get x(){invoked=true;return 1;}};const symbol={[Symbol('x')]:1};const sparse=Array(2);
 for(const v of [undefined,()=>{},Infinity,NaN,1n,new Date(),cyclic,getter,symbol,sparse,JSON.parse('{"__proto__":{"x":1}}'),{x:'x'.repeat(262145)}])assert.throws(()=>copyMethodData(v));
 assert.equal(invoked,false);const original={matrix:[[1,2]],state:{text:'Ответ',yes:true,empty:null},events:[{ms:0.4}]},copy=copyMethodData(original);original.matrix[0][0]=99;assert.equal(copy.matrix[0][0],1);assert.equal(Object.isFrozen(copy.matrix[0]),true);
});

test('Current TKI and Karpov are modules; existing calculation values and shapes remain equivalent',()=>{
 const {calculatePinnedInstrument}=require('../dist/src/scoring/instruments.js'),{builtinInstrumentRegistry}=require('../dist/src/scoring/builtin-instrument-modules.js');
 for(const [file,count,value] of [['tki',30,'A'],['karpov',27,'4']]){const core=require('../core/'+file+'-contract.js'),input={contract_version:core.CONTRACT_VERSION,method_version_id:core.METHOD_VERSION_ID,handler_version:core.HANDLER_VERSION,responses:Array.from({length:count},(_,i)=>({item_id:'q'+String(i+1).padStart(2,'0'),value}))};const expected=(core.scoreTki||core.scoreKarpov)(input);assert.deepEqual(calculatePinnedInstrument(input),expected);const d=builtinInstrumentRegistry.descriptors().find(x=>x.method_version_id===input.method_version_id);assert.equal(builtinInstrumentRegistry.checkDraft(d,input).complete,true);assert.equal(builtinInstrumentRegistry.checkDraft(d,{...input,responses:[]}).complete,false);}
 assert.throws(()=>calculatePinnedInstrument({method_version_id:'unknown',contract_version:'1.0',handler_version:'unknown',responses:[]}),e=>e.code==='RELEASE_UNAVAILABLE');
});

test('Release adapter verifies original snapshots while publishing only explicit participant form fields',()=>{
 const {releasePackage}=require('../storage/releases.js'),{verifyPinnedChoiceRelease,pinnedParticipantForm}=require('../dist/src/adapters/pinned-instrument-releases.js'),p=releasePackage();
 const row={id:'synthetic',contract_version:'1.0',method_version_id:'tki_ru_30_pairs@1.0.0',handler_version:'tki-contract-0.3.0',form_id:p.form.id,form_version:p.form.version,form_snapshot:JSON.parse(p.formSnapshot),form_digest:p.formDigest,key_digest:p.keyDigest,verification_state:'key_verified',publication_state:'draft'};
 const items=p.form.items.map(i=>({item_id:i.id,ordinal:i.number,options:i.options})),pins=verifyPinnedChoiceRelease(row,items),form=pinnedParticipantForm(pins);
 for(const item of form.items)for(const option of item.options)assert.deepEqual(Object.keys(option).sort(),['text','value']);
 for(const forbidden of ['source_text','key_digest','provenance','audience'])assert.equal(JSON.stringify(form).includes(forbidden),false);
 assert.throws(()=>verifyPinnedChoiceRelease(row,items.map((i,n)=>n?i:{...i,options:form.items[0].options})),e=>e.code==='RELEASE_UNAVAILABLE');
});

test('Browser presenter registry supports an independent renderer and rejects missing or duplicate versions',()=>{
 const {createMethodPresenters,singleChoice}=require('../web/workspace/method-presenters.js');let received;
 const custom={id:'synthetic/drawing-with-timer',version:'v5',mount:context=>{received=context;return {state:'custom'};}};
 const registry=createMethodPresenters([singleChoice,custom]),context={asset_ref:'synthetic:owned',time_limit:15};assert.deepEqual(registry.mount(custom,context),{state:'custom'});assert.equal(received,context);
 assert.throws(()=>registry.mount({...custom,version:'v6'},context));assert.throws(()=>createMethodPresenters([custom,custom]),/DUPLICATE/);
});
