"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {validateMethodPackageJson:validate}=require("../dist/src/application/method-package-validation.js");
const fixture=require("./fixtures/method-package-fixture.js");
const run=p=>validate(JSON.stringify(p));
function rejected(change){const p=fixture();change(p);assert.throws(()=>run(p),e=>e.status===400&&e.code==="INVALID_METHOD_PACKAGE"&&e.message==="INVALID_METHOD_PACKAGE");}
test("method package: exact synthetic draft, no mutation/deep frozen output, never publication authority",()=>{
 const p=fixture(),before=JSON.stringify(p),result=run(p);assert.equal(JSON.stringify(p),before);assert.deepEqual(result.package,p);assert.equal(result.status,"structurally_valid_draft");assert.equal(result.publishable,false);
 for(const code of ["rights","artifacts_not_verified","handler_not_verified","scientific_review_required","publication_not_authorized"])assert.ok(result.blockers.includes(code));
 assert.ok(Object.isFrozen(result)&&Object.isFrozen(result.package.items[0])&&Object.isFrozen(result.blockers));assert.throws(()=>{result.package.review.publication="published";},TypeError);
});
test("method package: explicit incomplete draft is accepted with missing-field blockers, not fabricated data",()=>{
 const p=fixture();p.provenance.sources=[];p.provenance.missing=["instruction","form","scales","handler","control_vectors","source","key"];p.instruction.artifact_id=null;p.form={artifact_id:null,version:null};p.items=[];p.scales=[];p.artifacts=[];p.control_vectors=[];p.calculation={kind:"forced_choice",adapter_id:null,adapter_version:null,specification_artifact_id:null,key_artifact_id:null};
 const r=run(p);assert.equal(r.publishable,false);for(const code of p.provenance.missing)assert.ok(r.blockers.includes(code));assert.equal(r.package.items.length,0);assert.equal(r.package.calculation.key_artifact_id,null);
});
test("method package: JSON-only byte/depth bounds, duplicate escaped keys and pollution rejected neutrally",()=>{
 for(const raw of [null,{},[],42,"",'{"method_id":"first","method_id":"second"}', '{"method_id":"first","method_\\u0069d":"second"}', '{"__proto__":{}}','{"constructor":{}}','{"prototype":{}}','["'+"я".repeat(131073)+'"]',"[".repeat(17)+"0"+"]".repeat(17)])assert.throws(()=>validate(raw),e=>e.code==="INVALID_METHOD_PACKAGE");
 const p=fixture();p.title='Braces {}, quotes " and commas , within strings';assert.equal(run(p).package.title,p.title);
 assert.throws(()=>validate('{"title":"'+"\\\"".repeat(60000)),e=>e.code==="INVALID_METHOD_PACKAGE");
});
test("method package: all object levels whitelist keys, versions/types/status claims never coerced",()=>{
 const levels=[p=>p,p=>p.provenance,p=>p.rights,p=>p.instruction,p=>p.form,p=>p.items[0],p=>p.scales[0],p=>p.calculation,p=>p.norms,p=>p.control_vectors[0],p=>p.control_vectors[0].basis,p=>p.control_vectors[0].responses[0],p=>p.control_vectors[0].expected[0],p=>p.artifacts[0],p=>p.review];
 for(const at of levels)rejected(p=>{at(p).role="superadministrator";});
 for(const value of [null,[],"1",1,"01.0.0","1.0","1.0.0-beta","1.0.0+build"])rejected(p=>{p.package_version=value;});
 rejected(p=>{p.schema_version="2.0";});rejected(p=>{p.items[0].ordinal="1";});rejected(p=>{p.calculation.adapter_version=null;});rejected(p=>{p.form.version=null;});
 const existingForm=require("../methods/tki/form.json"),p=fixture();p.form.version=existingForm.version;assert.equal(run(p).package.form.version,"0.1.0-draft");
 for(const bad of ["0.1.0-unknown","0.1.0+build","0.1.0-draft.01","0.1.0-draft/../../"]){rejected(p=>{p.form.version=bad;});}
 for(const [key,value]of [["technical","verified"],["scientific","approved"],["publication","published"]])rejected(p=>{p.review[key]=value;});
});
test("method package: identifiers/text/finite numeric bounds/ordinals are strict",()=>{
 for(const v of ["../method","UPPER","","x".repeat(97)])rejected(p=>{p.method_id=v;});
 for(const v of ["", "x".repeat(201),"\u0000bad","bad\u202e", "bad\ud800"])rejected(p=>{p.title=v;});
 rejected(p=>{p.language="../../ru";});rejected(p=>{p.items[1].id="q01";});rejected(p=>{p.items[1].ordinal=1;});
 rejected(p=>{p.items[0].min=6;});rejected(p=>{p.items[0].min=0.5;});rejected(p=>{p.items[0].max=Number.MAX_SAFE_INTEGER+1;});
 rejected(p=>{p.scales[0].max=null;});rejected(p=>{p.scales[0].min=11;});
 const raw=JSON.stringify(fixture()).replace('"max":5','"max":1e999');assert.throws(()=>validate(raw),e=>e.code==="INVALID_METHOD_PACKAGE");
});
test("method package: data-only paths/content types/digests/byte totals, no executable or fetching refs",()=>{
 for(const path of ["../form.md","/form.md","C:/form.md","form\\x.md","https://example.test/form.md","folder/./form.md","folder//form.md","f%2f.md","f.js","f.zip","f.exe","f.md?token=secret","f.md#x","f.MD"])rejected(p=>{p.artifacts[0].path=path;});
 rejected(p=>{p.artifacts[0].path="instruction.json";});rejected(p=>{p.artifacts[1].path="instruction.md";});
 for(const sha of ["a".repeat(63),"A".repeat(64),"z".repeat(64),null])rejected(p=>{p.artifacts[0].sha256=sha;});
 for(const n of [0,-1,1.2,1048577])rejected(p=>{p.artifacts[0].bytes=n;});
 rejected(p=>{p.artifacts=Array.from({length:9},(_,i)=>({id:"a"+i,path:"a"+i+".md",bytes:1048576,sha256:"a".repeat(64),media_type:"text/markdown"}));});
});
test("method package: provenance/artifact/source references unique and present; unknown rights cannot become approved",()=>{
 rejected(p=>{p.provenance.sources.push(p.provenance.sources[0]);});rejected(p=>{p.artifacts.push(p.artifacts[0]);});rejected(p=>{p.instruction.artifact_id="missing";});
 for(const url of ["http://example.test/","file:///source","javascript:alert(1)","https://name:password@example.test/"])rejected(p=>{p.provenance.sources[0].url=url;});
 rejected(p=>{p.provenance.missing=["unknown"];});rejected(p=>{p.provenance.missing=["source","source"];});rejected(p=>{p.rights.status="approved";});rejected(p=>{p.rights.source_ids=["synthetic_source"];});
 rejected(p=>{p.rights.status="evidence_supplied";});rejected(p=>{p.control_vectors[0].basis.source_ids=["unknown"];});
 const p=fixture();p.rights={status:"evidence_supplied",source_ids:["synthetic_source"]};p.provenance.sources[0].url="https://example.test/source";assert.equal(run(p).publishable,false);
});
test("method package: absent norms never imputed, evidence needs sources/table/applicability and still not approved",()=>{
 rejected(p=>{p.norms.artifact_id="form";});rejected(p=>{p.norms.status="evidence_supplied";});rejected(p=>{p.norms.source_ids=["synthetic_source"];});
 const p=fixture();p.norms={status:"evidence_supplied",artifact_id:"form",applicability_artifact_id:"instruction",source_ids:["synthetic_source"]};const r=run(p);assert.equal(r.publishable,false);assert.equal(r.package.review.scientific,"draft");assert.ok(r.blockers.includes("scientific_review_required"));
});
test("method package: synthetic control vectors exact own items/scales/order/ranges and source basis",()=>{
 rejected(p=>{p.control_vectors[0].data_origin="participant";});rejected(p=>{p.control_vectors[0].responses.pop();});rejected(p=>{p.control_vectors[0].responses.reverse();});rejected(p=>{p.control_vectors[0].responses[0].value="1";});
 rejected(p=>{p.control_vectors[0].responses[0].value=0.5;});rejected(p=>{p.control_vectors[0].responses[0].value=6;});rejected(p=>{p.control_vectors[0].expected[0].value=11;});rejected(p=>{p.control_vectors[0].expected[0].scale_id="unknown";});
 rejected(p=>{p.control_vectors[0].basis.source_ids=[];});rejected(p=>{p.control_vectors.push(p.control_vectors[0]);});
 const p=fixture();p.control_vectors[0].basis.kind="legacy_regression";assert.equal(run(p).publishable,false);
});
test("method package: choice/continuous/reverse/profile/special descriptors supported without executing scoring",()=>{
 for(const kind of ["sum","reverse_sum","profile","special"]){const p=fixture();p.calculation.kind=kind;p.items[0].kind="number";p.control_vectors[0].responses[0].value=1.5;assert.equal(run(p).package.calculation.kind,kind);}
 const p=fixture();p.calculation.kind="forced_choice";p.items=p.items.map(x=>({id:x.id,ordinal:x.ordinal,kind:"single_choice",options:[{value:"A",label:"Первый"},{value:"B",label:"Второй"}]}));p.control_vectors[0].responses.forEach(x=>{x.value="A";});
 assert.ok(run(p).blockers.includes("key"));p.calculation.key_artifact_id="form";assert.equal(run(p).publishable,false);
 for(const mutation of [p=>{p.items[0].options.pop();},p=>{p.items[0].options[1].value="A";},p=>{p.control_vectors[0].responses[0].value="C";}]){const q=structuredClone(p);mutation(q);assert.throws(()=>run(q),e=>e.code==="INVALID_METHOD_PACKAGE");}
});
test("method package: deterministic collection caps reject resource expansion",()=>{
 for(const [key,n]of [["artifacts",33],["items",501],["scales",101],["control_vectors",21]])rejected(p=>{p[key]=Array(n).fill(p[key][0]);});
 rejected(p=>{p.provenance.sources=Array(51).fill(p.provenance.sources[0]);});
});
