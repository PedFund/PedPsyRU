"use strict";
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto'),{Pool}=require('pg'),{validateConfig}=require('./local-demo.js');
const root=path.resolve(__dirname,'..'),sha=b=>createHash('sha256').update(b).digest('hex');
function preparedLegacyLibrary(){
 const library=JSON.parse(fs.readFileSync(path.join(root,'methods/legacy/library.json'),'utf8'));
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'methods/legacy/manifest.json'),'utf8'));
 if(library.schema_version!==1||library.version!=='5.5.0'||library.methods.length!==50||new Set(library.methods.map(x=>x.method_id)).size!==50||library.methods.filter(x=>x.legacy_scoring_ready).length!==48)throw Error('INVALID_LEGACY_LIBRARY');
 const sources=manifest.files.map(a=>{if(!/^methods\/legacy\/materials\/(?:[\p{L}\p{N}_.()—–-]+\/)*[\p{L}\p{N}_.()—–-]+$/u.test(a.path)||a.path.includes('..'))throw Error('INVALID_LEGACY_PATH');const bytes=fs.readFileSync(path.join(root,a.path));if(bytes.length!==a.bytes||sha(bytes)!==a.sha256)throw Error('LEGACY_SOURCE_MISMATCH');return {...a,bytes};});
 const bounded=(values,max)=>Array.isArray(values)&&values.length<=max&&values.every(x=>typeof x==='string'&&x.length>0&&x.length<=500);
 for(const m of library.methods){if(!/^[a-z][a-z0-9_]{0,95}$/.test(m.method_id)||typeof m.title!=='string'||m.title.length>200||!Number.isInteger(m.item_count)||m.item_count<1||m.item_count>500||!bounded(m.indicators,100)||!bounded(m.subscales,100)||!bounded(m.search_terms,100)||!Array.isArray(m.outputs)||m.outputs.length>200||m.outputs.some(x=>!x||typeof x.label!=='string'||x.label.length>500||!['number','text'].includes(x.value_type))||Buffer.byteLength(JSON.stringify(m))>262144)throw Error('INVALID_LEGACY_METHOD');}
 return {library,sources};
}
async function importLegacyLibrary(client){const {library,sources}=preparedLegacyLibrary();await client.query('SELECT pg_advisory_xact_lock(5151980035)');
 for(const a of sources){const old=(await client.query('SELECT sha256 FROM pedpsy.legacy_method_sources WHERE version=$1 AND path=$2',[library.version,a.path])).rows[0];if(old&&old.sha256!==a.sha256)throw Error('LEGACY_VERSION_CONFLICT');if(!old)await client.query('INSERT INTO pedpsy.legacy_method_sources VALUES($1,$2,$3,$4)',[library.version,a.path,a.bytes,a.sha256]);}
 for(const m of library.methods){const json=JSON.stringify(m),digest=sha(json),old=(await client.query('SELECT sha256 FROM pedpsy.legacy_method_versions WHERE method_id=$1 AND version=$2',[m.method_id,library.version])).rows[0];if(old&&old.sha256!==digest)throw Error('LEGACY_VERSION_CONFLICT');if(!old)await client.query('INSERT INTO pedpsy.legacy_method_versions VALUES($1,$2,$3::jsonb,$4,$5)',[m.method_id,library.version,json,digest,Date.now()]);}
 return {methods:library.methods.length,legacy_ready:library.methods.filter(m=>m.legacy_scoring_ready).length,sources:sources.length};
}
async function main(){const owner=validateConfig(JSON.parse(fs.readFileSync(path.join(root,'.local/demo-stand/owner.json'),'utf8')),'owner'),pool=new Pool({...owner,max:1,ssl:false}),client=await pool.connect();try{await client.query('BEGIN');const counts=await importLegacyLibrary(client);await client.query('COMMIT');console.log('Legacy library imported without changing existing online releases:',JSON.stringify(counts));}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();await pool.end();}}
if(require.main===module)main().catch(e=>{console.error('Legacy import stopped:',/^[A-Z_]+$/.test(e.message)?e.message:'CHECK_LEGACY_LIBRARY');process.exitCode=1;});
module.exports={preparedLegacyLibrary,importLegacyLibrary};
