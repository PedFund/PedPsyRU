'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {postgresFixture}=require('./postgres-fixture.js'),{importLegacyBatchLocal}=require('../scripts/import-legacy-batch-local.js'),{legacyBatchReleases}=require('../storage/legacy-batch-release.js');
test('PostgreSQL longer item identifiers preserve the pinned release boundary',async t=>{
 const f=await postgresFixture();t.after(()=>f.close());const c=await f.admin.connect();try{
  await c.query('BEGIN');const ids=await importLegacyBatchLocal(c);await c.query('COMMIT');const release=ids[0],options=legacyBatchReleases()[0].form.items[0].options;
  await c.query('BEGIN');for(const n of [100,500])await c.query('INSERT INTO pedpsy.release_items(release_id,item_id,ordinal,options) VALUES($1,$2,$3,$4::jsonb)',[release,'q'+n,n,JSON.stringify(options)]);
  assert.equal((await c.query('SELECT pedpsy.constructor_release_allowed($1) allowed',[release])).rows[0].allowed,false);await c.query('ROLLBACK');assert.equal((await c.query('SELECT pedpsy.constructor_release_allowed($1) allowed',[release])).rows[0].allowed,true);
  await c.query('BEGIN');await assert.rejects(c.query('INSERT INTO pedpsy.release_items(release_id,item_id,ordinal,options) VALUES($1,$2,$3,$4::jsonb)',[release,'q501',501,JSON.stringify(options)]),e=>e.code==='23514');await c.query('ROLLBACK');
  await c.query('BEGIN');await assert.rejects(c.query('INSERT INTO pedpsy.release_items(release_id,item_id,ordinal,options) VALUES($1,$2,$3,$4::jsonb)',[release,'q0100',100,JSON.stringify(options)]),e=>e.code==='23514');await c.query('ROLLBACK');
 }finally{c.release();}
});
