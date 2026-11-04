"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict");
const {qlesqReleasePackage}=require("../storage/qlesq-release.js");
const {scoreQlesq,CONTRACT_VERSION,METHOD_VERSION_ID,HANDLER_VERSION}=require("../core/qlesq-contract.js");
const {qlesqLocalMaterials}=require("../scripts/qlesq-local-materials.js");
test("QLESQ 36: complete versioned anchored form and matching source",()=>{
 const p=qlesqReleasePackage(),m=qlesqLocalMaterials(),source=require("../methods/qlesq/source/1.0.0.json");
 assert.equal(p.form.items.length,36);assert.equal(m.pkg.control_vectors.length,2);
 p.form.items.forEach((item,i)=>{assert.equal(item.text,source.items[i].title);assert.equal(item.options.length,10);
  assert.equal(item.options[0].text,"1 – "+source.items[i].anchor_1);
  assert.equal(item.options[9].text,"10 – "+source.items[i].anchor_10);});
 assert.equal(p.form.items[27].options[0].text,"1 – Очень часто");
 assert.equal(p.form.items[27].options[9].text,"10 – Никогда");
 for(const vector of m.pkg.control_vectors){
 const score=scoreQlesq({contract_version:CONTRACT_VERSION,method_version_id:METHOD_VERSION_ID,handler_version:HANDLER_VERSION,responses:vector.responses});
 assert.equal(score.status,"scored");for(const expected of vector.expected)assert.equal(score.measures.find(x=>x.code===expected.scale_id).value,expected.value,expected.scale_id);
 }
});
test("QLESQ 36: PostgreSQL immutable imported draft and catalogue",async t=>{
 const {postgresFixture}=require("./postgres-fixture.js"),{importQlesqLocal}=require("../scripts/import-qlesq-local.js");
 const f=await postgresFixture();t.after(()=>f.close());const c=await f.admin.connect();
 let id;try{await c.query("BEGIN");id=await importQlesqLocal(c);assert.equal(await importQlesqLocal(c),id);await c.query("COMMIT");}
 catch(e){await c.query("ROLLBACK");throw e;}finally{c.release();}
 const r=(await f.admin.query("SELECT * FROM pedpsy.instrument_releases WHERE id=$1",[id])).rows[0];
 assert.equal(r.verification_state,"key_verified");assert.equal(r.publication_state,"draft");
 assert.equal((await f.admin.query("SELECT COUNT(*)::int n FROM pedpsy.release_items WHERE release_id=$1",[id])).rows[0].n,36);
 assert.equal((await f.admin.query("SELECT pedpsy.constructor_release_allowed($1) ok",[id])).rows[0].ok,true);
});
