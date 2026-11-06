"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict");
const tki=require("./fixtures/tki-package-fixture.js"),karpov=require("./fixtures/karpov-package-fixture.js");
const {prepareMethodDraft,createMethodLibraryApi}=require("../dist/src/application/method-library.js"),{methodPackageHasher}=require("../dist/src/adapters/method-package-crypto.js"),{pinnedTkiMethodHandlers}=require("../dist/src/adapters/pinned-method-handlers.js"),{ScopedMemoryMethodArtifacts}=require("../dist/src/adapters/memory/method-artifacts.js");
test("library snapshots source bytes once, verifies pinned TKI and never promotes a draft",async()=>{
 const x=tki();let reads=0;const source={read:async({artifact})=>{reads++;return x.contents.find(a=>a.id===artifact.id).bytes;}};
 const result=await prepareMethodDraft(JSON.stringify(x.pkg),source,methodPackageHasher(),pinnedTkiMethodHandlers());assert.equal(reads,x.contents.length);assert.equal(result.verification.handler.state,"pinned");assert.equal(result.verification.publishable,false);
 const first=result.artifacts[0].bytes[0];x.contents[0].bytes[0]^=1;assert.equal(result.artifacts[0].bytes[0],first);
});
test("prepared repository descriptors preserve existing TKI and Karpov materials with explicit blockers",async()=>{
 const {preparedMethodDrafts}=require("../scripts/prepared-method-drafts.js");const drafts=preparedMethodDrafts();assert.equal(drafts.length,2);
 for(const x of drafts){const result=await prepareMethodDraft(JSON.stringify(x.pkg),new ScopedMemoryMethodArtifacts(x.pkg.method_id,x.pkg.package_version,x.contents),methodPackageHasher(),pinnedTkiMethodHandlers());assert.equal(result.verification.publishable,false);if(x.pkg.method_id==="reflexivity_karpov_27"){assert.equal(result.verification.handler.state,"unsupported");assert.ok(result.verification.blockers.includes("handler_not_verified"));assert.equal(x.pkg.items.length,27);}}
 assert.deepEqual(drafts[0].pkg,tki().pkg);assert.deepEqual(drafts[1].pkg,karpov().pkg);
});
test("catalogue searches titles/authors/indicators, rejects forged query and version paths",async()=>{
 const api=createMethodLibraryApi({catalog:async()=>[{title:"ТКИ",authors:["Томас"],indicators:["Сотрудничество"],search_terms:["конфликт"]}]});
 assert.equal((await api.catalog("token","сотрудничество")).length,1);assert.equal((await api.catalog("token","тревожность")).length,0);await assert.rejects(api.catalog("token",{q:"x"}));assert.throws(()=>api.read("token","../form","1.0.0"));
});
test("Issue 77 readiness is 11/11, immutable per read and keeps incomplete pilot packages outside admission",async()=>{
 const api=createMethodLibraryApi({transferStatus:async()=>({archived_methods:50,prepared_packages:2,assignable_releases:13,blocked_packages:1,mode:"allowlisted_packages_only"})});
 const first=await api.transferStatus("token"),second=await api.transferStatus("token");assert.equal(first.pilot_methods.length,11);assert.deepEqual(first.pilot_methods.map(x=>x.number),Array.from({length:11},(_,i)=>i+1));
 assert.deepEqual(first.pilot_methods.filter(x=>x.assignable).map(x=>[x.method_id,x.version]),[["tki_ru_30_pairs","1.0.0"]]);assert.equal(first.pilot_methods.some(x=>x.pilot_ready),false);
 assert.ok(first.pilot_methods.filter(x=>!x.assignable).every(x=>x.blockers.length>0));assert.notEqual(first.pilot_methods,second.pilot_methods);assert.throws(()=>first.pilot_methods[0].blockers.push("forged"));
});
