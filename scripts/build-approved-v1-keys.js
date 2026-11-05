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

// A package may document its own answer display: Hardiness shows 1..4 while scoring
// 0..3 and reverses as "3 - scored". The adapter encodes exactly that, not a guess.
const INPUT_ADAPTERS = {
  hardiness_leontiev_rasskazova_45: {valid: [1, 2, 3, 4], answerMap: {"1": 0, "2": 1, "3": 2, "4": 3}}
};

function keyFromContract(contract) {
  if (!contract.item_count || !Array.isArray(contract.values) || !contract.values.length) {
    throw new Error(contract.method_id + ":INCOMPLETE_CONTRACT");
  }
  const adapter = INPUT_ADAPTERS[contract.method_id];
  const key = {
    id: contract.method_id,
    key_version: contract.version,
    type: "passport",
    items: contract.item_count,
    valid: adapter ? adapter.valid.slice() : contract.values.slice(),
    ...(contract.reverse_max ? {reverseMax: contract.reverse_max} : {}),
    ...(adapter ? {answerMap: {...adapter.answerMap}} : contract.answer_map ? {answerMap: contract.answer_map} : {}),
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

const stagingFile = path.join(root, "methods", "validation", "pilot-11", "manifest.json");
function stagingAuthor(methodId) {
  try {
    const record = JSON.parse(fs.readFileSync(stagingFile, "utf8")).methods.find(item => item.method_id === methodId);
    return record && typeof record.author === "string" ? record.author.trim() : null;
  } catch { return null; }
}

// A package may describe its own scoring completely (scale item lists, reverse formula
// and overall cut-offs). Such a package is owner-supplied data, not a reconstruction:
// the key is built from it verbatim and only the scale ids are assigned explicitly.
const PACKAGE_SCALE_IDS = {
  ryff_pwb_84_shevelenkova_fesenko: ['positive_relations', 'autonomy', 'environment_mastery', 'personal_growth', 'purpose_in_life', 'self_acceptance']
};

// CO-36 describes its scales as an object map with 3 items each, a quota policy and
// three composite means. The key is built from that description verbatim.
const CO36_PLAN = {
  id: 'co36_kunitsyna_36',
  derived: {
    family_values: ['family_safety', 'family_traditions', 'family_interpersonal_relations', 'family_normative_conformity'],
    individual_values: ['individual_achievement', 'individual_power_influence', 'individual_hedonism', 'individual_activity_stimulation'],
    universal_moral_values: ['universal_independence', 'universal_moral_orientation', 'universal_tolerance', 'universal_spiritual']
  }
};

function co36Key(pkg) {
  if (pkg.id !== CO36_PLAN.id) return null;
  const source = pkg.scoring || {};
  const scales = source.scales || {};
  const ids = Object.keys(scales);
  if (ids.length !== 12) throw new Error(pkg.id + ':SCALE_COUNT_MISMATCH');
  const built = {};
  for (const id of ids) {
    const items = (scales[id].items || []).slice().sort((a, b) => a - b);
    if (items.length !== 3) throw new Error(pkg.id + ':SCALE_ITEM_COUNT');
    built[id] = {direct: items, reverse: [], aggregate: 'mean', label: scales[id].label || id};
  }
  const derived = {};
  for (const [name, inputs] of Object.entries(CO36_PLAN.derived)) derived[name] = {op: 'mean', inputs};
  const quota = source.approved_quota || undefined;
  return {id: pkg.id, key_version: '1.0.0-staging', type: 'passport', items: pkg.items.length,
    valid: source.response.valid.map(Number), scales: built, derived,
    ...(quota ? {quota} : {})};
}

// Motkov's 18 statements are presented as 36 single-choice items: odd items are
// the A scale (strength) and even items are the B scale (implementation). The key
// keeps the author's six factors and two general means, plus the two-dimensional
// Gpk table (A level x B level, preference to B).
const MOTKOV_ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI'];
const MOTKOV_A_LEVELS = [[1, 3.6, 'низкий'], [3.6, 4.3, 'средний'], [4.3, 4.65, 'высокий'], [4.65, 5, 'псевдовысокий']];
const MOTKOV_B_LEVELS = [[1, 2.9, 'низкий'], [2.9, 3.6, 'средний'], [3.6, 4.5, 'высокий'], [4.5, 5, 'псевдовысокий']];
const MOTKOV_GPK = {
  'низкий': {'низкий': 'низкий', 'средний': 'средний', 'высокий': 'средний', 'псевдовысокий': 'средний'},
  'средний': {'низкий': 'низкий', 'средний': 'средний', 'высокий': 'высокий', 'псевдовысокий': 'псевдовысокий'},
  'высокий': {'низкий': 'низкий', 'средний': 'средний', 'высокий': 'высокий', 'псевдовысокий': 'псевдовысокий'},
  'псевдовысокий': {'низкий': 'низкий', 'средний': 'средний', 'высокий': 'высокий', 'псевдовысокий': 'псевдовысокий'}
};

function motkovKey(pkg) {
  if (pkg.id !== 'motkov_psychological_culture_18') return null;
  if (!Array.isArray(pkg.items) || pkg.items.length !== 36) throw new Error(pkg.id + ':ITEM_COUNT_MISMATCH');
  if (!Array.isArray(pkg.factors) || pkg.factors.length !== 6) throw new Error(pkg.id + ':FACTOR_COUNT_MISMATCH');
  const scales = {}, levels = {};
  pkg.factors.forEach((factor, index) => {
    const source = (factor.items || []).slice().sort((a, b) => a - b);
    if (source.length !== 3 || source.some(item => !Number.isInteger(item) || item < 1 || item > 18)) {
      throw new Error(pkg.id + ':FACTOR_ITEMS_INVALID');
    }
    const a = source.map(item => 2 * item - 1), b = source.map(item => 2 * item);
    scales[MOTKOV_ROMAN[index] + '_A'] = {direct: a, aggregate: 'mean'};
    scales[MOTKOV_ROMAN[index] + '_B'] = {direct: b, aggregate: 'mean'};
    levels[MOTKOV_ROMAN[index] + '_A'] = MOTKOV_A_LEVELS;
    levels[MOTKOV_ROMAN[index] + '_B'] = MOTKOV_B_LEVELS;
  });
  scales.pk_A = {direct: Array.from({length: 18}, (_, index) => 2 * index + 1), aggregate: 'mean'};
  scales.pk_B = {direct: Array.from({length: 18}, (_, index) => 2 * index + 2), aggregate: 'mean'};
  levels.pk_A = MOTKOV_A_LEVELS;
  levels.pk_B = MOTKOV_B_LEVELS;
  return {id: pkg.id, key_version: pkg.version || '1.0.0-staging', type: 'passport', items: 36,
    valid: [1, 2, 3, 4, 5], scales, levels,
    crossLevels: {gpk: {left: 'pk_A – уровень', right: 'pk_B – уровень', table: MOTKOV_GPK}}};
}

function keyFromPackage(pkg) {
  const motkov = motkovKey(pkg);
  if (motkov) return motkov;
  const co36 = co36Key(pkg);
  if (co36) return co36;
  const ids = PACKAGE_SCALE_IDS[pkg.id];
  if (!ids) return null;
  if (!Array.isArray(pkg.items) || !Array.isArray(pkg.scales) || pkg.scales.length !== ids.length) {
    throw new Error(pkg.id + ':SCALE_COUNT_MISMATCH');
  }
  const reverseMax = 7;
  const scales = {};
  pkg.scales.forEach((scale, index) => {
    const direct = (scale.direct_items || []).slice().sort((a, b) => a - b);
    const reverse = (scale.reverse_items || []).slice().sort((a, b) => a - b);
    if (!direct.length || !reverse.length) throw new Error(pkg.id + ':EMPTY_SCALE');
    scales[ids[index]] = {direct, reverse, reverseMax, aggregate: 'sum'};
  });
  const levels = {};
  const cuts = pkg.scoring && pkg.scoring.overall_cutoffs_source;
  if (Array.isArray(cuts) && cuts.length) levels.overall = cuts.map(cut => [cut.min, cut.max, cut.level]);
  return {id: pkg.id, key_version: '1.0.0-staging', type: 'passport', items: pkg.items.length,
    valid: [1, 2, 3, 4, 5, 6], reverseMax, scales,
    derived: {overall: {op: 'sum', inputs: ids.slice()}},
    ...(Object.keys(levels).length ? {levels} : {})};
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
      package_file: source.file, package_version: source.pkg.version, title: source.pkg.title,
      author: stagingAuthor(contract.method_id), items: key.items});
  }
  for (const [id, source] of packages) {
    if (written.some(entry => entry.method_id === id)) continue;
    let key;
    try { key = keyFromPackage(source.pkg); }
    catch (error) { skipped.push({method_id: id, reason: error.message}); continue; }
    if (!key) { skipped.push({method_id: id, reason: 'NO_CONTRACT'}); continue; }
    const text = JSON.stringify(key, null, 2) + "\n";
    fs.writeFileSync(path.join(outDir, id + ".key.json"), text, "utf8");
    written.push({method_id: id, key_version: key.key_version, key_digest: sha(text),
      package_file: source.file, package_version: source.pkg.version, title: source.pkg.title,
      author: stagingAuthor(id), items: key.items});
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
