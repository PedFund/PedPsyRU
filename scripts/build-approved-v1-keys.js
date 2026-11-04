#!/usr/bin/env node
// Offline generator: turns the verified Issue #69/#75 scoring contracts into
// declarative numeric keys for the existing scoreNumericPassport engine.
// It never invents a key: a method without a contract is skipped and reported.
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const root = path.resolve(__dirname, "..");
const contractsFile = path.join(root, "methods", "validation", "pilot-11", "scoring-contracts.json");
const approvedDir = path.join(root, "methods", "approved", "v1");
const outDir = path.join(approvedDir, "keys");

const sha = value => "sha256:" + crypto.createHash("sha256").update(value).digest("hex");

function scaleOf(name, scale, contract) {
  const reverseItems = new Set(contract.reverse || []);
  const direct = [];
  const reverse = [];
  if (Array.isArray(scale)) {
    for (const item of scale) (reverseItems.has(item) ? reverse : direct).push(item);
  } else {
    direct.push(...(scale.direct || []));
    reverse.push(...(scale.reverse || []));
  }
  const out = {};
  if (direct.length) out.direct = direct.slice().sort((a, b) => a - b);
  if (reverse.length) out.reverse = reverse.slice().sort((a, b) => a - b);
  if (!direct.length && !reverse.length) throw new Error(name + ":EMPTY_SCALE");
  if (reverse.length) out.reverseMax = contract.reverse_max;
  out.aggregate = contract.scale_calculation === "mean" ? "mean" : "sum";
  return out;
}

function keyFromContract(contract) {
  if (!contract.item_count || !Array.isArray(contract.values) || !contract.values.length) {
    throw new Error(contract.method_id + ":INCOMPLETE_CONTRACT");
  }
  const key = {
    id: contract.method_id,
    key_version: contract.version,
    type: "passport",
    items: contract.item_count,
    valid: contract.values.slice(),
    ...(contract.reverse_max ? {reverseMax: contract.reverse_max} : {}),
    ...(contract.answer_map ? {answerMap: contract.answer_map} : {}),
    ...(contract.quota ? {quota: contract.quota} : {}),
    ...(contract.calculation === "uncentered_mean_without_rounding" ? {fullPrecision: true} : {}),
    scales: {},
    ...(contract.derived ? {derived: {}} : {}),
    ...(contract.higher_order ? {derived: {}} : {}),
    ...(contract.levels ? {levels: contract.levels} : {}),
    ...(contract.norms ? {norms: contract.norms} : {})
  };
  for (const [name, scale] of Object.entries(contract.scales || {})) key.scales[name] = scaleOf(name, scale, contract);
  if (contract.derived) {
    for (const [name, parts] of Object.entries(contract.derived)) {
      if (!Array.isArray(parts) || !parts.length) throw new Error(name + ":INVALID_DERIVED");
      key.derived[name] = {op: "sum", inputs: parts.slice()};
    }
  }
  if (contract.higher_order) {
    for (const [name, parts] of Object.entries(contract.higher_order)) {
      if (!Array.isArray(parts) || !parts.length) throw new Error(name + ":INVALID_HIGHER_ORDER");
      key.derived[name] = {op: "mean", inputs: parts.slice()};
    }
  }
  if (contract.aggregate && contract.aggregate.quality_of_life_index === "mean_of_scale_sums") {
    const inputs = Object.keys(key.scales);
    key.derived = {...(key.derived || {}), quality_of_life_index: {op: "mean", inputs}};
  }
  if (contract.sten) {
    key.norms = {...(key.norms || {}), reflexivity: {ranges: contract.sten, suffix: " – стен", round: 0}};
    if (contract.sten_levels) key.levels = {...(key.levels || {}), "reflexivity – стен": contract.sten_levels};
  }
  return key;
}

function main() {
  const contracts = JSON.parse(fs.readFileSync(contractsFile, "utf8")).contracts;
  const packages = new Map();
  for (const file of fs.readdirSync(approvedDir).filter(name => name.endsWith(".json"))) {
    const pkg = JSON.parse(fs.readFileSync(path.join(approvedDir, file), "utf8"));
    if (pkg && typeof pkg.id === "string") packages.set(pkg.id, {file, pkg});
  }
  fs.mkdirSync(outDir, {recursive: true});
  const written = [];
  const skipped = [];
  for (const contract of contracts) {
    const source = packages.get(contract.method_id);
    if (!source) { skipped.push({method_id: contract.method_id, reason: "NO_APPROVED_PACKAGE"}); continue; }
    if (!Array.isArray(source.pkg.items) || source.pkg.items.length !== contract.item_count) {
      skipped.push({method_id: contract.method_id, reason: "ITEM_COUNT_MISMATCH"}); continue;
    }
    let key;
    try { key = keyFromContract(contract); }
    catch (error) { skipped.push({method_id: contract.method_id, reason: error.message}); continue; }
    const text = JSON.stringify(key, null, 2) + "\n";
    fs.writeFileSync(path.join(outDir, contract.method_id + ".key.json"), text, "utf8");
    written.push({method_id: contract.method_id, key_version: contract.version, key_digest: sha(text),
      package_file: source.file, package_version: source.pkg.version, items: key.items});
  }
  const manifest = {schema_version: "1.0.0", generated_by: "scripts/build-approved-v1-keys.js",
    source_contracts: "methods/validation/pilot-11/scoring-contracts.json",
    note: "Declarative keys for scoreNumericPassport. Not a release, not scientific approval.",
    keys: written, skipped};
  fs.writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n", "utf8");
  console.log("keys written: " + written.length + "; skipped: " + skipped.length);
  for (const item of skipped) console.log("SKIP " + item.method_id + " " + item.reason);
}

if (require.main === module) main();
module.exports = {keyFromContract, scaleOf};
