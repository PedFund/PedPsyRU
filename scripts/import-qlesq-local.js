"use strict";
const {randomUUID}=require("node:crypto");
const {qlesqLocalMaterials}=require("./qlesq-local-materials.js");
const {qlesqReleasePackage}=require("../storage/qlesq-release.js");
const {canonicalJson}=require("../storage/releases.js");
const {prepareMethodDraft}=require("../dist/src/application/method-library.js");
const {ScopedMemoryMethodArtifacts}=require("../dist/src/adapters/memory/method-artifacts.js");
const {methodPackageHasher}=require("../dist/src/adapters/method-package-crypto.js");
const {pinnedQlesqMethodHandler}=require("../dist/src/adapters/pinned-qlesq-handler.js");
const {methodDraftSqlInput}=require("../dist/src/adapters/postgres/method-library.js");
async function importQlesqLocal(client){
 const x=qlesqLocalMaterials(),p=qlesqReleasePackage();
 const prepared=await prepareMethodDraft(JSON.stringify(x.pkg),new ScopedMemoryMethodArtifacts(x.pkg.method_id,x.pkg.package_version,x.contents),methodPackageHasher(),pinnedQlesqMethodHandler());
 if(prepared.verification.handler.state!=="pinned"||prepared.verification.publishable!==false)throw Error("QLESQ_DRAFT_VERIFICATION_REQUIRED");
 await client.query("SELECT pg_advisory_xact_lock(5151980034)");
 const head=(await client.query("SELECT revision FROM pedpsy.method_library_heads WHERE method_id=$1",[x.pkg.method_id])).rows[0];
 await client.query("SELECT pedpsy.append_method_library_draft($1,$2,$3,$4::jsonb,$5::jsonb)",[head?.revision??0,...methodDraftSqlInput(prepared)]);
 let r=(await client.query("SELECT * FROM pedpsy.instrument_releases WHERE method_version_id=$1 AND handler_version=$2",[p.methodVersionId,p.handlerVersion])).rows[0];
 if(r){
  const items=(await client.query("SELECT item_id,ordinal,options FROM pedpsy.release_items WHERE release_id=$1 ORDER BY ordinal",[r.id])).rows;
  if(r.form_digest!==p.formDigest||r.key_digest!==p.keyDigest||canonicalJson(r.form_snapshot)!==p.formSnapshot||items.length!==36||
     items.some((i,n)=>i.item_id!==p.form.items[n].id||i.ordinal!==n+1||canonicalJson(i.options)!==canonicalJson(p.form.items[n].options)))throw Error("QLESQ_RELEASE_CHANGED");
 } else {
  const id=randomUUID();await client.query("INSERT INTO pedpsy.instrument_releases(id,method_id,form_id,form_version,method_version_id,handler_version,contract_version,form_digest,key_digest,verification_state,publication_state,artifact_ref,form_snapshot) VALUES($1,$2,$3,$4,$5,$6,'1.0',$7,$8,'key_verified','draft',$9,$10::jsonb)",
  [id,x.pkg.method_id,p.form.id,p.form.version,p.methodVersionId,p.handlerVersion,p.formDigest,p.keyDigest,"repo:methods/qlesq/form-local.json+keys/1.0.0-draft.json",p.formSnapshot]);
  for(const item of p.form.items)await client.query("INSERT INTO pedpsy.release_items VALUES($1,$2,$3,$4::jsonb)",[id,item.id,item.number,JSON.stringify(item.options)]);
  r={id};
 }
 await client.query("INSERT INTO pedpsy.method_library_catalog VALUES($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7::jsonb) ON CONFLICT(release_id) DO NOTHING",
 [r.id,x.pkg.method_id,x.pkg.package_version,p.form.title,JSON.stringify(["Н. Е. Водопьянова"]),JSON.stringify(x.pkg.scales.map(s=>s.label)),JSON.stringify(["Q-LES-Q","качество жизни","Водопьянова"])]);
 if(!(await client.query("SELECT pedpsy.constructor_release_allowed($1) allowed",[r.id])).rows[0].allowed)throw Error("QLESQ_RELEASE_NOT_ALLOWED");
 return r.id;
}
module.exports={importQlesqLocal};
