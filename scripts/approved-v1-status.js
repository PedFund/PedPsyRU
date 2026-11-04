#!/usr/bin/env node
// Readiness report for the approved library. It answers, per method: is the scoring
// key generated, can the package become a release, is the release pinned in a
// migration, and is it therefore assignable. Nothing is changed by this script.
"use strict";
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const keysManifest = JSON.parse(fs.readFileSync(path.join(root, "methods", "approved", "v1", "keys", "manifest.json"), "utf8"));
const {approvedV1Releases} = require("../storage/approved-v1-release.js");

const migrationFiles = fs.readdirSync(path.join(root, "storage", "postgres"))
  .filter(name => /^\d{3}_.*\.sql$/.test(name)).sort();
const migrationText = migrationFiles.map(name => fs.readFileSync(path.join(root, "storage", "postgres", name), "utf8")).join("\n");

const packages = fs.readdirSync(path.join(root, "methods", "approved", "v1"))
  .filter(name => name.endsWith(".json"))
  .map(name => JSON.parse(fs.readFileSync(path.join(root, "methods", "approved", "v1", name), "utf8")))
  .filter(pkg => pkg && typeof pkg.id === "string");

const {releases, unsupported} = approvedV1Releases();
const unsupportedBy = new Map(unsupported.map(item => [item.method_id, item.reason]));
const keyById = new Map(keysManifest.keys.map(item => [item.method_id, item]));

const rows = packages.map(pkg => {
  const key = keyById.get(pkg.id);
  const release = releases.find(candidate => candidate.id === pkg.id);
  const pinned = release ? migrationText.includes("'" + release.methodVersionId + "'") : false;
  return {
    id: pkg.id,
    items: Array.isArray(pkg.items) ? pkg.items.length : 0,
    key: key ? "yes" : "no",
    package: release ? "yes" : "no",
    blocked: release ? "" : (unsupportedBy.get(pkg.id) || "NO_PACKAGE"),
    pinned: pinned ? "yes" : "no",
    assignable: release && pinned ? "yes" : "no"
  };
}).sort((a, b) => a.id.localeCompare(b.id));

const pad = (value, width) => String(value).padEnd(width);
console.log(pad("method", 38) + pad("items", 6) + pad("key", 5) + pad("package", 9) + pad("pinned", 8) + "assignable");
for (const row of rows) {
  console.log(pad(row.id, 38) + pad(row.items, 6) + pad(row.key, 5) + pad(row.package, 9) + pad(row.pinned, 8) +
    (row.assignable === "yes" ? "yes" : "no  <- " + row.blocked));
}
const assignable = rows.filter(row => row.assignable === "yes").length;
console.log("\nassignable through this pipeline: " + assignable + " of " + rows.length + "; pinned migrations: " + migrationFiles.length);
console.log("note: tki_ru_30_pairs is pinned by the original seed import, not by this pipeline.");
const reasons = new Map();
for (const row of rows.filter(item => item.assignable !== "yes")) reasons.set(row.blocked, (reasons.get(row.blocked) || 0) + 1);
for (const [reason, count] of reasons) console.log("  blocked (" + count + "): " + reason);
