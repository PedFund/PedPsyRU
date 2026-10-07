"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),crypto=require("node:crypto");
const form=require("../methods/karpov/form.json"),key=require("../methods/karpov/keys/0.1.0-draft.json"),legacy=require("../methods.js").byId.reflexivity_karpov_27,processor=require("../processor.js");
const fixture=require("./fixtures/karpov-package-fixture.js");
const hash=v=>crypto.createHash("sha256").update(JSON.stringify(v)).digest("hex");
test("Karpov material draft:27 exact owner-source statements, canonicalIDs/order, source state not silently approved",()=>{
 assert.equal(form.items.length,27);form.items.forEach((x,i)=>{assert.equal(x.id,"q"+String(i+1).padStart(2,"0"));assert.equal(x.number,i+1);assert.equal(typeof x.source_text,"string");assert.ok(x.source_text.length>0);});
 assert.equal(hash(form.items.map(x=>x.source_text)),"68d6d3fb60df01637872322c192be6ecf1d960b97d1905bc75a79841fd5fb211");
 assert.equal(form.status,"draft");assert.equal(form.instruction_status,"technical_draft_not_author_instruction");assert.match(form.provenance.source_verification,/pending/);assert.match(form.provenance.rights_status,/unknown/);assert.equal(form.provenance.reference_urls[0],"https://psyjournras.ru/s0205-95920000621-0-1-ru-280");
});
test("Karpov shared form: only responding gender in11/26 and six agreement labels changed through slash",()=>{
 assert.deepEqual(form.items.filter(x=>x.text!==x.source_text).map(x=>x.number),[11,26]);
 for(const x of form.items){const expected=x.number===11?x.source_text.replace("составил","составил/составила"):x.number===26?x.source_text.replace("виноватым","виноватым/виноватой"):x.source_text;assert.equal(x.text,expected);}
 assert.deepEqual(form.response_format.options.filter(x=>x.text!==x.source_text).map(x=>x.value),[1,2,3,5,6,7]);assert.equal(hash(form.response_format.options.map(x=>x.source_text)),"789a4dd73623e6338c7b909d14b969003064a496330cce1882e28b4f502d93b7");
 for(const o of form.response_format.options)assert.equal(o.text,o.source_text.replace(/Согласен|согласен/g,m=>m+"/согласна"));
});
test("Karpov labels: literal numeric1..7 retained, value4 is an answer not an imputed missing response",()=>{
 assert.deepEqual(form.response_format.values,[1,2,3,4,5,6,7]);assert.deepEqual(form.response_format.options.map(x=>x.value),[1,2,3,4,5,6,7]);assert.equal(form.response_format.required,true);assert.equal(form.response_format.options[3].text,"Не могу определиться");
 assert.equal(processor.scoreComplete(legacy,Array(27).fill(4)).metrics["Рефлексивность"],108);
});
test("Karpov raw key: calculation fields exactly existing implementation, no stens/levels/norms imported",()=>{
 const fields=["id","items","type","valid","reverseMax","scales"],shape=Object.fromEntries(fields.map(k=>[k,key[k]]));assert.deepEqual(shape,Object.fromEntries(fields.map(k=>[k,legacy[k]])));assert.equal(hash(shape),"4992123ed197210833bedd35974ef0eeb872d5f7307a5067288d99e7d6c632de");
 assert.equal(key.provenance.calculation_digest_sha256,hash(shape));for(const field of ["stenTable","norms","levels","classifications"])assert.equal(Object.hasOwn(key,field),false);assert.equal(key.norms_included,false);assert.equal(key.verification_state,"legacy_unverified");assert.equal(key.publication_state,"draft");
});
test("Karpov raw controls: direction sets cover27 once, five synthetic vectors are regressions not independent validity",()=>{
 const {direct,reverse}=key.scales["Рефлексивность"];assert.equal(direct.length,15);assert.equal(reverse.length,12);assert.equal(new Set([...direct,...reverse]).size,27);assert.deepEqual([...direct,...reverse].sort((a,b)=>a-b),Array.from({length:27},(_,i)=>i+1));
 for(const vector of fixture().pkg.control_vectors){assert.equal(vector.basis.kind,"legacy_regression");assert.equal(vector.data_origin,"synthetic");assert.equal(processor.scoreComplete(legacy,vector.responses.map(x=>x.value)).metrics["Рефлексивность"],vector.expected[0].value);}
});
test("Karpov draft: current package validator/artifact integrity accept data but retain handler/source/scientific/publication blockers",async()=>{
 const {validateMethodPackageJson}=require("../dist/src/application/method-package-validation.js"),{verifyMethodArtifactIntegrity}=require("../dist/src/application/method-artifact-integrity.js"),{methodPackageHasher}=require("../dist/src/adapters/method-package-crypto.js"),{ScopedMemoryMethodArtifacts}=require("../dist/src/adapters/memory/method-artifacts.js");
 const {pkg,contents}=fixture(),parsed=validateMethodPackageJson(JSON.stringify(pkg));assert.equal(parsed.package.form.version,"0.1.0-draft");assert.equal(parsed.package.norms.status,"absent");assert.equal(parsed.publishable,false);
 const result=await verifyMethodArtifactIntegrity(JSON.stringify(pkg),new ScopedMemoryMethodArtifacts(pkg.method_id,pkg.package_version,contents),methodPackageHasher());assert.equal(result.evidence.checked.length,4);assert.equal(result.publishable,false);for(const code of ["handler","instruction","rights","artifact_content_not_validated","scientific_review_required","publication_not_authorized"])assert.ok(result.blockers.includes(code));
});
