"use strict";

const {randomUUID} = require("node:crypto");
const {sha256, transaction} = require("./database.js");
const form = require("../methods/tki/form.json");
const key = require("../methods/tki/keys/1.0.0.json");
const {scoreTki, CONTRACT_VERSION, METHOD_VERSION_ID, HANDLER_VERSION} = require("../core/tki-contract.js");

// Canonical JSON v1: sorted object keys, original array order; UTF-8 JSON.stringify.
// No whitespace/Unicode normalization: changing a text changes its digest.
function canonicalJson(value) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonicalJson).join(",") + "]";
  if (value && Object.getPrototypeOf(value) === Object.prototype) {
    return "{" + Object.keys(value).sort().map(k => JSON.stringify(k) + ":" + canonicalJson(value[k])).join(",") + "}";
  }
  throw new Error("NON_JSON_VALUE");
}

function releasePackage() {
  const probe = scoreTki({contract_version: CONTRACT_VERSION, method_version_id: METHOD_VERSION_ID,
    handler_version: HANDLER_VERSION, responses: form.items.map(item => ({item_id: item.id, value: "A"}))});
  const keyDigest = sha256(JSON.stringify({id: key.id, items: key.items, type: key.type, scales: key.scales}));
  if (probe.status !== "scored" || keyDigest !== probe.calculation.key_digest) throw new Error("KEY_PACKAGE_CHANGED");
  if (form.method_id !== key.id || form.provenance.scoring_key_version_id !== METHOD_VERSION_ID || form.items.length !== 30) {
    throw new Error("FORM_PACKAGE_MISMATCH");
  }
  form.items.forEach((item, i) => {
    if (item.number !== i + 1 || item.id !== "q" + String(i + 1).padStart(2, "0")
      || item.options.length !== 2 || item.options[0].value !== "A" || item.options[1].value !== "B"
      || item.options.some(option => typeof option.text !== "string" || !option.text.trim())) throw new Error("FORM_ITEMS_INVALID");
  });
  return {form, formSnapshot: canonicalJson(form), formDigest: sha256(canonicalJson(form)), keyDigest};
}

function importTkiRelease(db) {
  const pkg = releasePackage();
  return transaction(db, () => {
    const existing = db.prepare(`SELECT * FROM instrument_releases WHERE form_id=? AND form_version=?
      AND method_version_id=? AND handler_version=? AND contract_version=?`).get(form.id, form.version, METHOD_VERSION_ID, HANDLER_VERSION, CONTRACT_VERSION);
    if (existing) {
      const items = db.prepare("SELECT item_id,ordinal,options FROM release_items WHERE release_id=? ORDER BY ordinal").all(existing.id);
      if (existing.form_digest !== pkg.formDigest || existing.key_digest !== pkg.keyDigest || existing.form_snapshot !== pkg.formSnapshot
        || items.length !== 30 || items.some((item, i) => item.item_id !== form.items[i].id || item.ordinal !== i + 1 || item.options !== canonicalJson(form.items[i].options))) {
        throw new Error("RELEASE_SNAPSHOT_CHANGED");
      }
      return existing.id;
    }
    const id = randomUUID();
    db.prepare(`INSERT INTO instrument_releases(id,method_id,form_id,form_version,method_version_id,handler_version,
      contract_version,form_digest,key_digest,verification_state,publication_state,artifact_ref,form_snapshot)
      VALUES(?,?,?,?,?,?,?,?,?,'key_verified','draft',?,?)`).run(id, form.method_id, form.id, form.version,
      METHOD_VERSION_ID, HANDLER_VERSION, CONTRACT_VERSION, pkg.formDigest, pkg.keyDigest,
      "repo:methods/tki/form.json+methods/tki/keys/1.0.0.json;canonical-json-v1", pkg.formSnapshot);
    const insert = db.prepare("INSERT INTO release_items(release_id,item_id,ordinal,options) VALUES(?,?,?,?)");
    form.items.forEach(item => insert.run(id, item.id, item.number, canonicalJson(item.options)));
    return id;
  });
}

function responsesDigest(items, responses) {
  if (!Array.isArray(items) || !Array.isArray(responses)) throw new Error("INVALID_RESPONSES");
  const ids = items.map(item => item.item_id ?? item.id);
  if (ids.some(id => typeof id !== "string") || new Set(ids).size !== ids.length) throw new Error("INVALID_ITEMS");
  const byId = new Map();
  for (const response of responses) {
    if (!response || !ids.includes(response.item_id) || byId.has(response.item_id) || !["A","B"].includes(response.value)) {
      throw new Error("INVALID_RESPONSES");
    }
    byId.set(response.item_id, response.value);
  }
  return sha256(canonicalJson(ids.filter(id => byId.has(id)).map(id => ({item_id: id, value: byId.get(id)}))));
}

module.exports = {canonicalJson, releasePackage, importTkiRelease, responsesDigest};
