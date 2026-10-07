"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),crypto=require("node:crypto"),fs=require("node:fs");
const {verifyMethodArtifactIntegrity:verify}=require("../dist/src/application/method-artifact-integrity.js"),{methodPackageHasher}=require("../dist/src/adapters/method-package-crypto.js"),{ScopedMemoryMethodArtifacts:Reader}=require("../dist/src/adapters/memory/method-artifacts.js");
const fixture=require("./fixtures/method-package-fixture.js"),hash=methodPackageHasher();
function staged(){const pkg=fixture(),contents=pkg.artifacts.map((a,i)=>({id:a.id,path:a.path,bytes:Buffer.from(i===1?'{}':'Synthetic artifact '+i,"utf8")}));pkg.artifacts.forEach((a,i)=>{a.bytes=contents[i].bytes.byteLength;a.sha256=hash.sha256(contents[i].bytes);});return {pkg,contents,reader:new Reader(pkg.method_id,pkg.package_version,contents)};}
function mismatch(error){return error.status===400&&error.code==="METHOD_ARTIFACT_MISMATCH"&&error.message==="METHOD_ARTIFACT_MISMATCH";}
test("method artifacts: actual bounded SHA256 bytes/UTF8 checked, evidence frozen, no approval or handler claim",async()=>{
 const x=staged(),r=await verify(JSON.stringify(x.pkg),x.reader,hash);assert.equal(r.publishable,false);assert.equal(r.status,"structurally_valid_draft");assert.equal(r.evidence.checked.length,3);assert.match(r.evidence.package_digest,/^[a-f0-9]{64}$/);
 assert.ok(!r.blockers.includes("artifacts_not_verified"));for(const c of ["artifact_content_not_validated","handler_not_verified","scientific_review_required","publication_not_authorized"])assert.ok(r.blockers.includes(c));
 assert.ok(Object.isFrozen(r.evidence.checked[0])&&Object.isFrozen(r.evidence)&&Object.isFrozen(r.blockers));assert.throws(()=>{r.evidence.checked[0].sha256="fake";},TypeError);assert.equal(Object.hasOwn(r.evidence.checked[0],"content"),false);
});
test("method artifacts: canonical package evidence stable across object order, sensitive to array order and text",async()=>{
 const x=staged(),a=await verify(JSON.stringify(x.pkg),x.reader,hash),reordered=Object.fromEntries(Object.entries(x.pkg).reverse());assert.equal((await verify(JSON.stringify(reordered),x.reader,hash)).evidence.package_digest,a.evidence.package_digest);
 x.pkg.title+=" changed";assert.notEqual((await verify(JSON.stringify(x.pkg),x.reader,hash)).evidence.package_digest,a.evidence.package_digest);
 x.pkg.title=fixture().title;x.pkg.artifacts.reverse();assert.notEqual((await verify(JSON.stringify(x.pkg),x.reader,hash)).evidence.package_digest,a.evidence.package_digest);
});
test("method artifacts: missing/hash/byte-size/UTF8 errors neutral; schema checked before any read",async()=>{
 for(const mutate of [x=>{x.pkg.artifacts[0].sha256="f".repeat(64);},x=>{x.pkg.artifacts[0].bytes++;},x=>{x.reader={read:async()=>null};},x=>{x.reader={read:async()=>"not bytes"};}]){const x=staged();mutate(x);await assert.rejects(verify(JSON.stringify(x.pkg),x.reader,hash),mismatch);}
 const x=staged(),bad=Buffer.from([255]);x.pkg.artifacts[0].bytes=1;x.pkg.artifacts[0].sha256=hash.sha256(bad);x.contents[0].bytes=bad;x.reader=new Reader(x.pkg.method_id,x.pkg.package_version,x.contents);await assert.rejects(verify(JSON.stringify(x.pkg),x.reader,hash),mismatch);
 let reads=0;await assert.rejects(verify('{"role":"superadministrator"}',{read:async()=>{reads++;return null;}},hash),e=>e.code==="INVALID_METHOD_PACKAGE");assert.equal(reads,0);
});
test("method artifacts: method/package/artifact/path scope not guessed or substituted",async()=>{
 for(const change of [p=>{p.method_id="other_method";},p=>{p.package_version="0.2.0";},p=>{p.artifacts[0].path="other.md";}]){const x=staged();change(x.pkg);await assert.rejects(verify(JSON.stringify(x.pkg),x.reader,hash),mismatch);}
 const x=staged();assert.equal(await x.reader.read({method_id:x.pkg.method_id,package_version:x.pkg.package_version,artifact:{...x.pkg.artifacts[0],id:"unknown"}}),null);
 assert.ok(Object.isFrozen(x.reader));assert.equal(Object.hasOwn(x.reader,"entries"),false);assert.throws(()=>{x.reader.methodId="other_method";},TypeError);
});
test("method artifacts: source/read buffers isolated, byte snapshot protects hashing from mutable Buffer views",async()=>{
 const x=staged();x.contents[0].bytes.fill(0);const a=await x.reader.read({method_id:x.pkg.method_id,package_version:x.pkg.package_version,artifact:x.pkg.artifacts[0]});a.fill(0);assert.equal((await verify(JSON.stringify(x.pkg),x.reader,hash)).evidence.checked.length,3);
 const y=staged();let source;const reader={read:async input=>{source=y.contents.find(x=>x.id===input.artifact.id).bytes;return source;}},hasher={sha256:bytes=>{if(source)source.fill(0);return hash.sha256(bytes);}};
 assert.equal((await verify(JSON.stringify(y.pkg),reader,hasher)).evidence.checked.length,3);
});
test("method artifacts: provider failures/malformed digest fail closed without private error text or partial evidence",async()=>{
 for(const [reader,hasher]of [[{read:async()=>{throw Error("PRIVATE CONTENT");}},hash],[staged().reader,{sha256:()=>{throw Error("PRIVATE DIGEST");}}],[staged().reader,{sha256:()=>"not sha"}]])await assert.rejects(verify(JSON.stringify(staged().pkg),reader,hasher),e=>e.status===503&&e.code==="METHOD_VERIFICATION_UNAVAILABLE"&&!e.message.includes("PRIVATE"));
 const x=staged();let reads=0;const reader={read:async input=>{reads++;if(reads===2)return null;return x.reader.read(input);}};await assert.rejects(verify(JSON.stringify(x.pkg),reader,hash),mismatch);assert.equal(reads,2);
});
test("method artifacts: empty or incomplete draft stays blocked; supplied matching bytes are NOT semantic validation",async()=>{
 const x=staged();x.pkg.instruction.artifact_id=null;x.pkg.form={artifact_id:null,version:null};x.pkg.calculation.specification_artifact_id=null;x.pkg.artifacts=[];const r=await verify(JSON.stringify(x.pkg),new Reader(x.pkg.method_id,x.pkg.package_version,[]),hash);assert.equal(r.evidence.checked.length,0);assert.ok(r.blockers.includes("artifacts_not_verified")&&r.blockers.includes("form"));assert.equal(r.publishable,false);
 const y=staged();y.contents[1].bytes=Buffer.from("NOT JSON OR A FORM");y.pkg.artifacts[1].bytes=y.contents[1].bytes.byteLength;y.pkg.artifacts[1].sha256=hash.sha256(y.contents[1].bytes);const data=await verify(JSON.stringify(y.pkg),new Reader(y.pkg.method_id,y.pkg.package_version,y.contents),hash);assert.ok(data.blockers.includes("artifact_content_not_validated"));assert.equal(data.publishable,false);
});
test("method artifacts: host staging bounds/duplicates and SHA256 known vector, no files/network/execution",()=>{
 assert.equal(hash.sha256(Buffer.from("abc")),"ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
 const row={id:"a",path:"a.txt",bytes:Buffer.from("x")};for(const rows of [Array(33).fill(row),[row,row],[{...row,bytes:Buffer.alloc(0)}],[{...row,bytes:Buffer.alloc(1048577)}],Array.from({length:9},(_,i)=>({id:"a"+i,path:"a"+i+".txt",bytes:Buffer.alloc(1048576)}))])assert.throws(()=>new Reader("synthetic_sum","0.1.0",rows),e=>e.code==="INVALID_METHOD_ARTIFACT_STAGE");
 const source=fs.readFileSync("src/adapters/memory/method-artifacts.ts","utf8");assert.doesNotMatch(source,/readFile|fetch\(|eval\(|localStorage|sessionStorage/);
});
