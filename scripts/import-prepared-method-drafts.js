"use strict";
// Explicit offline local import. No startup imports, new accounts or credentials.
const fs=require("node:fs"),path=require("node:path"),{Pool}=require("pg");
const {validateConfig}=require("./local-demo.js"),{preparedMethodDrafts}=require("./prepared-method-drafts.js");
const {prepareMethodDraft}=require("../dist/src/application/method-library.js"),{ScopedMemoryMethodArtifacts}=require("../dist/src/adapters/memory/method-artifacts.js"),{methodPackageHasher}=require("../dist/src/adapters/method-package-crypto.js"),{pinnedTkiMethodHandlers}=require("../dist/src/adapters/pinned-method-handlers.js"),{methodDraftSqlInput}=require("../dist/src/adapters/postgres/method-library.js");
async function main(){
 const root=path.resolve(__dirname,".."),owner=validateConfig(JSON.parse(fs.readFileSync(path.join(root,".local/demo-stand/owner.json"),"utf8")),"owner");
 const pool=new Pool({...owner,max:1,ssl:false}),client=await pool.connect();
 try{await client.query("BEGIN");await client.query("SELECT pg_advisory_xact_lock(5151980034)");
  for(const source of preparedMethodDrafts()){
   const p=source.pkg,prepared=await prepareMethodDraft(JSON.stringify(p),new ScopedMemoryMethodArtifacts(p.method_id,p.package_version,source.contents),methodPackageHasher(),pinnedTkiMethodHandlers());
   const head=(await client.query("SELECT revision FROM pedpsy.method_library_heads WHERE method_id=$1",[p.method_id])).rows[0];
   await client.query("SELECT pedpsy.append_method_library_draft($1,$2,$3,$4::jsonb,$5::jsonb)",[head?.revision??0,...methodDraftSqlInput(prepared)]);
   // Only bind the already permitted clinical release with the exact trusted
   // handler identity. Draft Karpov remains absent from participant/researcher UI.
   if(prepared.verification.handler.state==="pinned")await client.query("INSERT INTO pedpsy.method_library_catalog(release_id,method_id,package_version,title,authors,indicators,search_terms) SELECT r.id,$1,$2,$3,$4::jsonb,$5::jsonb,$6::jsonb FROM pedpsy.instrument_releases r WHERE r.method_id=$1 AND r.method_version_id=$7 AND r.handler_version=$8 AND pedpsy.constructor_release_allowed(r.id) ON CONFLICT(release_id) DO NOTHING",[p.method_id,p.package_version,p.title,JSON.stringify(source.authors),JSON.stringify(p.scales.map(s=>s.label)),JSON.stringify(source.search_terms),prepared.verification.handler.method_version_id,prepared.verification.handler.handler_version]);
  }
  await client.query("COMMIT");console.log("Prepared TKI and Karpov drafts stored with immutable versions/artifacts. Only the existing allowed TKI release is visible in the catalogue.");
 }catch(e){await client.query("ROLLBACK");throw e;}finally{client.release();await pool.end();}
}
if(require.main===module)main().catch(e=>{console.error("Prepared library import stopped; existing releases preserved.",/^[A-Z0-9_]+$/.test(e.code||"")?e.code:"CHECK_PREPARED_MATERIALS");process.exitCode=1;});
module.exports={main};
