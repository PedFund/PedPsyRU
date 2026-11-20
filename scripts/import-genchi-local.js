"use strict";
// Imports the pinned Genchi measurement release. The migration only prepares guards
// and functions; the release data is imported the same way as the other pinned
// methods, so existing databases keep their baseline domains until the import runs.
const {createHash} = require("node:crypto");
const {genchiReleasePackage} = require("../storage/genchi-release.js");
const {canonicalJson} = require("../storage/releases.js");
const RELEASE_ID = "00000000-0000-4000-8000-00000000e111";
async function importGenchiLocal(client) {
  const p = genchiReleasePackage();
  const packageJson = JSON.stringify({method_id: "genchi_breath_hold", package_version: "1.0.0",
    review: {technical: "unverified", scientific: "draft", publication: "draft"}});
  const packageDigest = createHash("sha256").update(packageJson).digest("hex");
  await client.query("INSERT INTO pedpsy.method_library_versions(method_id,package_version,revision,package_json,package_digest,evidence,created_at_ms) " +
    "VALUES('genchi_breath_hold','1.0.0',1,$1,$2,'{}'::jsonb,floor(extract(epoch FROM clock_timestamp())*1000)::bigint) ON CONFLICT(method_id,package_version) DO NOTHING", [packageJson, packageDigest]);
  let release = (await client.query("SELECT * FROM pedpsy.instrument_releases WHERE method_version_id=$1 AND handler_version=$2",
    [p.methodVersionId, p.handlerVersion])).rows[0];
  if (release) {
    const items = (await client.query("SELECT item_id,ordinal,options FROM pedpsy.release_items WHERE release_id=$1 ORDER BY ordinal", [release.id])).rows;
    if (release.form_digest !== p.formDigest || release.key_digest !== p.keyDigest || canonicalJson(release.form_snapshot) !== p.formSnapshot ||
      items.length !== 2 || items.some((item, index) => item.item_id !== p.form.items[index].id || item.ordinal !== index + 1 ||
        canonicalJson(item.options) !== canonicalJson(p.form.items[index].options))) throw new Error("GENCHI_RELEASE_CHANGED");
    return release.id;
  }
  await client.query("INSERT INTO pedpsy.instrument_releases(id,method_id,form_id,form_version,method_version_id,handler_version,contract_version,form_digest,key_digest,verification_state,publication_state,artifact_ref,form_snapshot) " +
    "VALUES($1,'genchi_breath_hold',$2,$3,$4,$5,'1.0',$6,$7,'key_verified','draft','repo:methods/genchi/key.json',$8::jsonb)",
    [RELEASE_ID, p.form.id, p.form.version, p.methodVersionId, p.handlerVersion, p.formDigest, p.keyDigest, p.formSnapshot]);
  for (const item of p.form.items) {
    await client.query("INSERT INTO pedpsy.release_items VALUES($1,$2,$3,$4::jsonb)", [RELEASE_ID, item.id, item.number, JSON.stringify(item.options)]);
  }
  await client.query("INSERT INTO pedpsy.method_library_catalog VALUES($1,'genchi_breath_hold','1.0.0','Проба Генчи',$2::jsonb,$3::jsonb,$4::jsonb) ON CONFLICT(release_id) DO NOTHING",
    [RELEASE_ID, JSON.stringify(["А.И. Пустозеров", "А.Г. Гостев"]), JSON.stringify(["Время задержки дыхания, с", "Оценка"]), JSON.stringify(["генчи", "задержка дыхания"])]);
  await client.query("INSERT INTO pedpsy.release_allowlist(release_id,created_at_ms) VALUES($1,floor(extract(epoch FROM clock_timestamp())*1000)::bigint) ON CONFLICT(release_id) DO NOTHING",[RELEASE_ID]);
  if (!(await client.query("SELECT pedpsy.constructor_release_allowed($1) allowed", [RELEASE_ID])).rows[0].allowed) throw new Error("GENCHI_RELEASE_NOT_ALLOWED");
  return RELEASE_ID;
}
module.exports = {importGenchiLocal, GENCHI_RELEASE_ID: RELEASE_ID};
