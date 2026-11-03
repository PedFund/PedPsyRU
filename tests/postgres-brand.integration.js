"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict"),{randomUUID}=require("node:crypto"),{postgresFixture}=require("./postgres-fixture.js");
test("МетодТест branding uses new immutable policy versions without rewriting historical records",async t=>{
 const f=await postgresFixture({seedData:false});t.after(()=>f.close());
 const oldNotice=(await f.admin.query("SELECT body FROM pedpsy.contact_notices WHERE version='demo-contact-1'")).rows[0].body,newNotice=(await f.admin.query("SELECT body FROM pedpsy.contact_notices WHERE version='demo-contact-2'")).rows[0].body;
 assert.match(oldNotice,/ПедПси/);assert.doesNotMatch(oldNotice,/МетодТест/);assert.match(newNotice,/МетодТест/);assert.doesNotMatch(newNotice,/ПедПси/);
 const id=randomUUID();await f.admin.query("INSERT INTO pedpsy.studies(id,title) VALUES($1,'Synthetic brand study')",[id]);
 assert.deepEqual((await f.admin.query("SELECT notice_version FROM pedpsy.study_contact_policies WHERE study_id=$1",[id])).rows[0],{notice_version:"demo-contact-2"});
 assert.deepEqual((await f.admin.query("SELECT revision,participation_version FROM pedpsy.study_consent_policies WHERE study_id=$1",[id])).rows[0],{revision:0,participation_version:"demo-participation-2"});
 await assert.rejects(f.admin.query("UPDATE pedpsy.contact_notices SET body=body WHERE version='demo-contact-2'"),e=>e.code==="23514");
 await assert.rejects(f.admin.query("UPDATE pedpsy.consent_documents SET body_text=body_text WHERE version='demo-participation-2'"),e=>e.code==="23514");
 for(const table of ["contact_notices","consent_documents"])await assert.rejects(f.runtime.query("SELECT * FROM pedpsy."+table),e=>e.code==="42501");
});
