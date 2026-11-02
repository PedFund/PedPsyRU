"use strict";
const {test}=require('node:test'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const {postgresFixture}=require('./postgres-fixture.js'),{verifiedStaff}=require('./mfa-fixture.js'),{studyResearcher}=require('./study-fixture.js'),{workspaceFixture,headers}=require('./workspace-fixture.js');
const {importLegacyLibrary,preparedLegacyLibrary}=require('../scripts/import-legacy-library.js'),{PostgresMethodLibrary}=require('../dist/src/adapters/postgres/method-library.js');
async function load(f){const c=await f.admin.connect();try{await c.query('BEGIN');const result=await importLegacyLibrary(c);await c.query('COMMIT');return result;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
test('PostgreSQL legacy library imports 50 methods idempotently, preserves actual bytes and denies runtime writes',async t=>{
 const f=await postgresFixture();t.after(()=>f.close());assert.deepEqual(await load(f),{methods:50,legacy_ready:48,sources:63});await load(f);
 assert.equal((await f.admin.query('SELECT count(*)::integer n FROM pedpsy.legacy_method_versions')).rows[0].n,50);
 const sources=(await f.admin.query('SELECT path,sha256,content FROM pedpsy.legacy_method_sources')).rows;assert.equal(sources.length,63);for(const a of sources)assert.equal(createHash('sha256').update(a.content).digest('hex'),a.sha256);
 await assert.rejects(f.runtime.query('SELECT * FROM pedpsy.legacy_method_versions'),{code:'42501'});await assert.rejects(f.runtime.query('SELECT * FROM pedpsy.legacy_method_sources'),{code:'42501'});
 await assert.rejects(f.admin.query("UPDATE pedpsy.legacy_method_versions SET version='wrong'"));await assert.rejects(f.admin.query('DELETE FROM pedpsy.legacy_method_sources'));
 const before=(await f.admin.query('SELECT count(*)::integer n FROM pedpsy.instrument_releases')).rows[0].n;assert.equal(before,1);
 const manifest=preparedLegacyLibrary();assert.equal(manifest.library.methods.find(x=>x.method_id==='reflexivity_karpov_27').control_vectors[0].expected.metrics['Рефлексивность'],(await f.admin.query("SELECT (document->'control_vectors'->0->'expected'->'metrics'->>'Рефлексивность')::numeric AS value FROM pedpsy.legacy_method_versions WHERE method_id='reflexivity_karpov_27'")).rows[0].value*1);
});
test('PostgreSQL planning catalogue exposes only result metadata to current staff/researcher and keeps assignment authority separate',async t=>{
 const f=await postgresFixture();t.after(()=>f.close());await load(f);const s=await verifiedStaff(f),r=await studyResearcher(f,s),store=new PostgresMethodLibrary(f.runtime);
 const data=await store.planning(r.session.token);assert.equal(data.length,50);const k=data.find(m=>m.method_id==='reflexivity_karpov_27');assert.deepEqual(k.releases,[]);assert.equal(k.outputs.length,3);assert.equal(k.legacy_scoring_ready,true);assert.equal(k.item_count,27);
 for(const m of data)assert.deepEqual(Object.keys(m).sort(),['method_id','version','title','authors','item_count','summary','indicators','subscales','outputs','legacy_scoring_ready','online_form_present','search_terms','blank_source','releases'].sort());
 const json=JSON.stringify(data);assert.ok(!json.includes('control_vectors'));assert.ok(!json.includes('reverseMax'));assert.ok(!json.includes('stenTable'));assert.ok(!json.includes('source_path'));
 const w=workspaceFixture(f,undefined,{library:true});t.after(()=>w.app.close());const rh={...headers,cookie:'pedpsy_researcher_demo='+r.session.token};
 assert.equal((await w.app.inject({url:'/api/v2/researcher/method-library/catalogue',headers:rh})).json().length,50);
 assert.equal((await w.app.inject({url:'/api/v2/researcher/method-library/catalogue?include=keys',headers:rh})).statusCode,400);
 assert.equal((await w.app.inject({url:'/api/v2/researcher/method-library/catalogue',headers:{...headers,cookie:'pedpsy_researcher_demo='+s.session.token}})).statusCode,401);
 assert.equal((await w.app.inject({url:'/api/v2/staff/method-library/catalogue',headers:{...headers,cookie:'pedpsy_staff_demo='+r.session.token}})).statusCode,401);
 await assert.rejects(store.planning('x'.repeat(43)));
 await f.admin.query("CREATE FUNCTION pedpsy.synthetic_planning_audit_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic audit failed'; END $$;CREATE TRIGGER synthetic_planning_audit_fail BEFORE INSERT ON pedpsy.access_audit_events FOR EACH ROW EXECUTE FUNCTION pedpsy.synthetic_planning_audit_fail()");await assert.rejects(store.planning(r.session.token));await f.admin.query('DROP TRIGGER synthetic_planning_audit_fail ON pedpsy.access_audit_events');
 await r.management.block(s.session.token,r.row.id);await assert.rejects(store.planning(r.session.token));
});
