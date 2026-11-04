#!/usr/bin/env node
// Builds method-package 1.0 drafts for the approved releases that fit the existing
// single-choice screen. A package is only written when its own control vector is
// reproduced by the key; nothing is published or approved by this step.
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const {createHash} = require("node:crypto");
const {approvedV1Releases} = require("../storage/approved-v1-release.js");
const {entries} = require("../core/approved-v1-data.js");
const {scoreNumericPassport} = require("../core/numeric-passport.js");

const root = path.resolve(__dirname, "..");
const target = path.join(root, "methods", "approved", "v1", "releases");
const sha = buffer => "sha256:" + createHash("sha256").update(buffer).digest("hex");
// A package version is plain numeric SemVer; the release identity keeps "-staging".
const cleanVersion = value => value.replace(/-(staging|draft)(\.\d+)?$/, "");

function boundsOf(key, scale) {
  const values = key.valid.slice().sort((a, b) => a - b);
  const low = values[0], high = values[values.length - 1];
  const reverseMax = scale.reverseMax !== undefined ? scale.reverseMax : key.reverseMax;
  const direct = Array.isArray(scale.direct) ? scale.direct : [];
  const reverse = Array.isArray(scale.reverse) ? scale.reverse : [];
  if (!direct.length && !reverse.length) throw new Error("EMPTY_SCALE");
  if (reverse.length && !Number.isFinite(reverseMax)) throw new Error("MISSING_REVERSE_MAX");
  const min = direct.length * low + reverse.length * (reverseMax - high);
  const max = direct.length * high + reverse.length * (reverseMax - low);
  if (scale.aggregate === "mean") {
    const count = direct.length + reverse.length;
    return {min: min / count, max: max / count};
  }
  return {min, max};
}

function scalesOf(key, expected) {
  const ranges = new Map();
  const scales = [];
  const used = new Set();
  // A package scale id is a lowercase token; the display label keeps the key's name.
  const scaleId = name => {
    let id = name.toLowerCase().replace(/[^a-z0-9_-]+/g, "_").replace(/^[^a-z]+/, "s_");
    if (!/^[a-z]/.test(id)) id = "s_" + id;
    let unique = id, index = 2;
    while (used.has(unique)) unique = id + "_" + (index++);
    used.add(unique);
    return unique;
  };
  for (const [id, scale] of Object.entries(key.scales || {})) {
    const value = expected[id];
    if (typeof value !== "number") throw new Error("SCALE_NOT_SCORED:" + id);
    const {min, max} = boundsOf(key, scale);
    ranges.set(id, {min, max});
    scales.push({id: scaleId(id), label: id, min, max, direction: "not_specified"});
  }
  for (const [id, derived] of Object.entries(key.derived || {})) {
    const value = expected[id];
    if (typeof value !== "number") throw new Error("DERIVED_NOT_SCORED:" + id);
    const parts = derived.inputs.map(part => {
      const range = ranges.get(part);
      if (!range) throw new Error("DERIVED_INPUT_UNKNOWN:" + part);
      return range;
    });
    let min, max;
    if (derived.op === "sum") {
      min = parts.reduce((sum, range) => sum + range.min, 0);
      max = parts.reduce((sum, range) => sum + range.max, 0);
    } else if (derived.op === "mean") {
      min = parts.reduce((sum, range) => sum + range.min, 0) / parts.length;
      max = parts.reduce((sum, range) => sum + range.max, 0) / parts.length;
    } else {
      throw new Error("UNSUPPORTED_DERIVED:" + derived.op);
    }
    ranges.set(id, {min, max});
    scales.push({id: scaleId(id), label: id, min, max, direction: "not_specified"});
  }
  return scales;
}

function build(entry, release) {
  const answers = Array.from({length: release.itemCount}, (_, index) => ({
    item_id: "q" + String(index + 1).padStart(2, "0"), value: entry.valid[0]}));
  const expected = scoreNumericPassport(entry.key, answers.map(answer => Number(answer.value))).metrics;
  const scales = scalesOf(entry.key, expected);
  const vector = scales.filter(scale => typeof expected[scale.label] === "number")
    .map(scale => ({scale_id: scale.id, value: expected[scale.label]}));

  const folder = path.join(target, release.id);
  const files = {
    "form.json": Buffer.from(JSON.stringify(release.form, null, 2) + "\n", "utf8"),
    "key.json": Buffer.from(JSON.stringify(entry.key, null, 2) + "\n", "utf8"),
    "instruction.txt": Buffer.from((release.form.instruction || "").trim() + "\n", "utf8"),
    "specification.txt": Buffer.from(
      "Handler approved-numeric-1.0.0. Answers " + entry.valid.join(",") + ", " + release.itemCount + " items, all required.\n" +
      "Scales: " + Object.keys(entry.key.scales || {}).join(", ") + ".\n" +
      (Object.keys(entry.key.derived || {}).length ? "Derived: " + Object.entries(entry.key.derived || {}).map(([name, d]) => name + "=" + d.op + "(" + d.inputs.join("+") + ")").join("; ") + ".\n" : "") +
      "Norms: no separate norm artifact is approved; the key alone carries the conversion tables, if any.\n" +
      "Publication rights are not documented. Scientific review is draft.\n", "utf8")
  };
  const artifacts = [
    {id: "form", path: "form.json", media_type: "application/json", bytes: files["form.json"]},
    {id: "key", path: "key.json", media_type: "application/json", bytes: files["key.json"]},
    {id: "instruction", path: "instruction.txt", media_type: "text/plain", bytes: files["instruction.txt"]},
    {id: "specification", path: "specification.txt", media_type: "text/plain", bytes: files["specification.txt"]}
  ].map(artifact => ({id: artifact.id, path: artifact.path, bytes: artifact.bytes.length,
    sha256: sha(artifact.bytes).slice(7), media_type: artifact.media_type}));

  const sourceId = release.id + "_approved_package";
  const pkg = {
    schema_version: "1.0",
    method_id: release.id,
    package_version: cleanVersion(entry.version),
    title: release.title,
    language: "ru",
    provenance: {origin: "owner_materials",
      sources: [{id: sourceId, citation: "Approved library package methods/approved/v1 (Issue #69 content decision).", url: null}],
      missing: ["rights"]},
    rights: {status: "unknown", source_ids: []},
    instruction: {artifact_id: "instruction"},
    form: {artifact_id: "form", version: release.form.version},
    items: release.form.items.map((item, index) => ({id: item.id, ordinal: index + 1, kind: "single_choice",
      options: item.options.map(option => ({value: option.value, label: option.text}))})),
    scales,
    calculation: {kind: "special", adapter_id: "approved-numeric", adapter_version: "1.0.0",
      specification_artifact_id: "specification", key_artifact_id: "key"},
    norms: {status: "absent", artifact_id: null, applicability_artifact_id: null, source_ids: []},
    control_vectors: [{id: "approved_key_vector", data_origin: "synthetic", responses: answers,
      expected: vector, basis: {kind: "independent", source_ids: [sourceId]}}],
    artifacts,
    review: {technical: "unverified", scientific: "draft", publication: "draft"}
  };

  fs.mkdirSync(folder, {recursive: true});
  for (const [name, bytes] of Object.entries(files)) fs.writeFileSync(path.join(folder, name), bytes);
  fs.writeFileSync(path.join(folder, "package-local.json"), JSON.stringify(pkg, null, 2) + "\n", "utf8");
  fs.writeFileSync(path.join(folder, "pins.json"), JSON.stringify({form: sha(files["form.json"]), key: entry.pins.key}, null, 2) + "\n", "utf8");
  return {id: release.id, package_version: entry.version, scales: scales.length, artifacts: artifacts.length};
}

function main() {
  const {releases} = approvedV1Releases();
  const byId = new Map(entries.map(entry => [entry.id, entry]));
  const built = [];
  for (const release of releases) {
    const entry = byId.get(release.id);
    if (!entry) throw new Error("ENTRY_MISSING:" + release.id);
    built.push(build(entry, release));
  }
  fs.writeFileSync(path.join(target, "manifest.json"),
    JSON.stringify({schema_version: "1.0.0", generated_by: "scripts/build-approved-v1-packages.js",
      note: "Draft packages for the pinned releases. Not a publication or a scientific approval.", packages: built}, null, 2) + "\n", "utf8");
  for (const item of built) console.log("package " + item.id + " v" + item.package_version + " scales=" + item.scales);
}

if (require.main === module) main();
module.exports = {build};
