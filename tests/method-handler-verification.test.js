"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs");
const {verifyMethodHandler:verify}=require("../dist/src/application/method-handler-verification.js"),{pinnedTkiMethodHandlers}=require("../dist/src/adapters/pinned-method-handlers.js"),{methodPackageHasher}=require("../dist/src/adapters/method-package-crypto.js"),{ScopedMemoryMethodArtifacts:Reader}=require("../dist/src/adapters/memory/method-artifacts.js");
const fixture=require("./fixtures/tki-package-fixture.js"),hash=methodPackageHasher(),registry=pinnedTkiMethodHandlers();
function check(x,reg=registry,reader=new Reader(x.pkg.method_id,x.pkg.package_version,x.contents)){return verify(JSON.stringify(x.pkg),reader,hash,reg);}
function error(code,status=400){return e=>e.status===status&&e.code===code&&e.message===code;}
test("method handler: exact existing TKI form/key and three raw vectors checked, frozen draft remains unapproved",async()=>{
 const r=await check(fixture());assert.equal(r.handler.state,"pinned");assert.equal(r.handler.method_version_id,"tki_ru_30_pairs@1.0.0");assert.equal(r.handler.handler_version,"tki-contract-0.3.0");assert.equal(r.handler.key_digest,"sha256:45bc0c8a1b3f154fb3da5df629da6c42613609633594c4f5f54014a301cded7d");assert.equal(r.handler.checked_vectors.length,3);assert.equal(r.publishable,false);
 assert.ok(!r.blockers.includes("handler_not_verified"));for(const b of ["artifact_content_not_validated","rights","scientific_review_required","publication_not_authorized","control_basis_review_required"])assert.ok(r.blockers.includes(b));assert.ok(Object.isFrozen(r.handler)&&Object.isFrozen(r.handler.checked_vectors[0]));assert.throws(()=>r.handler.checked_vectors[0].id="fake",TypeError);
});
test("method handler: own matching SHA does not authorize substituted key/form bytes",async()=>{
 for(const id of ["key","form"]){const x=fixture(),content=x.contents.find(c=>c.id===id),a=x.pkg.artifacts.find(a=>a.id===id);content.bytes=Buffer.from(content.bytes.toString()+" ");a.bytes=content.bytes.length;a.sha256=hash.sha256(content.bytes);await assert.rejects(check(x),error("METHOD_HANDLER_MISMATCH"));}
});
test("method handler: method-specific versions/schema/text/scales/normalization cannot be silently substituted",async()=>{
 for(const mutate of [p=>p.form.version="0.1.1",p=>p.calculation.adapter_version="0.3.1",p=>p.calculation.adapter_id="other",p=>p.calculation.kind="profile",p=>p.title+="!",p=>p.language="en",p=>p.items[0].options[0].label+="!",p=>p.items[0].options.reverse(),p=>p.scales[0].label+="!",p=>p.scales[0].max=13,p=>p.scales[0].direction="higher"]){const x=fixture();mutate(x.pkg);await assert.rejects(check(x),error("METHOD_HANDLER_MISMATCH"));}
});
test("method handler: wrong plausible expected score or answer vector fails exact execution comparison",async()=>{
 const x=fixture();x.pkg.control_vectors[0].expected[0].value=7;await assert.rejects(check(x),error("METHOD_CONTROL_MISMATCH"));
 const y=fixture();y.pkg.control_vectors[2].responses[20].value="B";await assert.rejects(check(y),error("METHOD_CONTROL_MISMATCH"));
});
test("method handler: absent vectors retain handler block; claimed independent basis is not scientific authority",async()=>{
 const x=fixture();x.pkg.control_vectors=[];const r=await check(x);assert.equal(r.handler.checked_vectors.length,0);assert.ok(r.blockers.includes("handler_not_verified")&&r.blockers.includes("control_vectors_required"));assert.equal(r.publishable,false);
 const y=fixture();y.pkg.control_vectors.forEach(v=>v.basis.kind="independent");const q=await check(y);assert.equal(q.handler.checked_vectors[0].basis,"independent");assert.ok(q.blockers.includes("control_basis_review_required"));assert.equal(q.publishable,false);
});
test("method handler: Karpov and unknown synthetic methods remain unsupported, not auto-registered",async()=>{
 const x=require("./fixtures/karpov-package-fixture.js")(),r=await check(x);assert.equal(r.handler.state,"unsupported");assert.equal(r.handler.key_digest,null);assert.equal(r.handler.checked_vectors.length,0);assert.ok(r.blockers.includes("handler_not_verified"));assert.equal(r.publishable,false);
});
test("method handler: DTO evidence forgery rejected before registry; provider failures neutral and no partial evidence",async()=>{
 let called=0;await assert.rejects(verify('{"handler":{"state":"pinned"}}',{read:async()=>null},hash,{resolve:()=>{called++;return null;}}),error("INVALID_METHOD_PACKAGE"));assert.equal(called,0);
 await assert.rejects(check(fixture(),{resolve:()=>{throw Error("PRIVATE SECRET");}}),error("METHOD_HANDLER_UNAVAILABLE",503));
 for(const run of [()=>{throw Error("PRIVATE RESULT");},()=>[{scale_id:"competing",value:NaN}],()=>[]])await assert.rejects(check(fixture(),{resolve:()=>({method_version_id:"synthetic",handler_version:"synthetic",key_digest:"synthetic",run})}),e=>["METHOD_HANDLER_UNAVAILABLE","METHOD_CONTROL_MISMATCH"].includes(e.code)&&!e.message.includes("PRIVATE"));
 const x=fixture();x.contents[0].bytes=Buffer.from("tamper");await assert.rejects(check(x,{resolve:()=>{called++;return null;}}),error("METHOD_ARTIFACT_MISMATCH"));assert.equal(called,0);
});
test("method handler: trusted registry exposes no uploaded execution/path/network or approval mutation",()=>{
 assert.ok(Object.isFrozen(registry));const source=fs.readFileSync("src/adapters/pinned-method-handlers.ts","utf8");assert.doesNotMatch(source,/eval\(|new Function|import\(|fetch\(|pkg\.artifacts.*readFile|localStorage|sessionStorage/);assert.equal((source.match(/readFileSync\(resolve/g)||[]).length,2);
});
