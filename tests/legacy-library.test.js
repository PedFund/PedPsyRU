"use strict";
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const {preparedLegacyLibrary}=require('../scripts/import-legacy-library.js');
test('legacy transfer preserves all 50 definitions, 63 source artifacts and result descriptions without inventing missing keys',()=>{
 const {library,sources}=preparedLegacyLibrary();assert.equal(library.methods.length,50);assert.equal(sources.length,63);assert.equal(library.methods.filter(x=>x.legacy_scoring_ready).length,48);
 const inventory=require('../METHOD_IMPORT_INVENTORY.json');assert.deepEqual(library.methods.map(x=>x.method_id).sort(),inventory.methods.map(x=>x.id).sort());
 for(const s of sources)assert.equal(createHash('sha256').update(s.bytes).digest('hex'),s.sha256);
 for(const m of library.methods.filter(x=>x.legacy_scoring_ready)){assert.ok(m.indicators.length);assert.ok(m.outputs.length);assert.ok(m.control_vectors.length);assert.ok(m.outputs.every(x=>!Object.hasOwn(x,'value')));}
 const k=library.methods.find(m=>m.method_id==='reflexivity_karpov_27'),draft=require('../methods/karpov/keys/0.1.0-draft.json');assert.deepEqual(k.definition.scales,draft.scales);assert.equal(k.item_count,27);assert.equal(k.outputs.length,3);assert.ok(k.outputs.some(x=>x.label==='Рефлексивность – стен'));assert.deepEqual(k.indicators,['Рефлексивность']);assert.deepEqual(k.subscales,[]);
 assert.ok(k.blank_source.endsWith('/trait/refkarp-bl.html'));assert.equal(k.definition.stenTable.find(([lo,hi])=>81>=lo&&81<=hi)[2],1);
 const co=library.methods.find(m=>m.method_id==='co36_kunitsyna_36');assert.ok(co.subscales.includes('Безопасность'));assert.ok(co.outputs.some(x=>x.label==='Семейные ценности'));
});
test('legacy archive contains source materials only, no respondent files or executable application imports',()=>{
 const {sources}=preparedLegacyLibrary();for(const a of sources){assert.ok(!/\.(?:xlsx?|db|sqlite|env|pem|zip)$/i.test(a.path));assert.ok(!/(?:^|\/)(?:Data|node_modules|outputs|\.local)(?:\/|$)/.test(a.path));}
 const code=fs.readFileSync(path.join(__dirname,'../scripts/import-legacy-library.js'),'utf8');assert.ok(!code.includes('P:/'));assert.ok(!code.includes('eval('));
});

test('researcher search finds anxiety scales across word variants and searches concrete subscales and authors',()=>{
 const {matches}=require('../web/workspace/method-search.js'),{library}=preparedLegacyLibrary();
 const found=library.methods.filter(m=>matches(m,'тревожность'));assert.ok(found.some(m=>m.title.includes('Бека')));assert.ok(found.some(m=>m.title.includes('Гамильтона')));assert.ok(found.some(m=>m.title.includes('Спилбергера')));
 assert.ok(library.methods.filter(m=>matches(m,'Карпов')).some(m=>m.method_id==='reflexivity_karpov_27'));
 assert.ok(library.methods.filter(m=>matches(m,'Моросанова')).some(m=>m.method_id==='sspm_2020_28'));
 assert.ok(library.methods.filter(m=>matches(m,'Безопасность')).some(m=>m.method_id==='co36_kunitsyna_36'));
 assert.equal(library.methods.filter(m=>matches(m,'нет-такой-методики')).length,0);
});
