"use strict";
// The host adapter must hand out a handler only for the package shipped in the
// repository, and must return the package's own scale ids.
const {test} = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {pinnedApprovedHandler} = require("../dist/src/adapters/pinned-approved-handler.js");

const folder = id => path.join(__dirname, "..", "methods", "approved", "v1", "releases", id);
const readPackage = id => JSON.parse(fs.readFileSync(path.join(folder(id), "package-local.json"), "utf8"));
const evidenceFor = pkg => ({checked: pkg.artifacts.map(a => ({artifact_id: a.id, sha256: a.sha256}))});

test("a shipped package resolves to a pinned handler with package scale ids", () => {
  const pkg = readPackage("reflexivity_karpov_27");
  const handler = pinnedApprovedHandler().resolve(pkg, evidenceFor(pkg));
  assert.equal(handler.handler_version, "approved-numeric-1.0.0");
  assert.equal(handler.method_version_id, "reflexivity_karpov_27@1.1.0-staging");
  const responses = pkg.items.map(item => ({item_id: item.id, value: "4"}));
  const measures = handler.run(responses);
  assert.ok(measures.length > 0);
  for (const measure of measures) {
    assert.ok(pkg.scales.some(scale => scale.id === measure.scale_id), measure.scale_id);
    assert.equal(typeof measure.value, "number");
  }
});

test("a tampered package, adapter or artifact digest is refused", () => {
  const pkg = readPackage("ttf_atf_10");
  const registry = pinnedApprovedHandler();
  const tampered = JSON.parse(JSON.stringify(pkg)); tampered.title = "Изменённый заголовок";
  assert.throws(() => registry.resolve(tampered, evidenceFor(pkg)), /METHOD_HANDLER_MISMATCH/);
  const wrongAdapter = JSON.parse(JSON.stringify(pkg)); wrongAdapter.calculation.adapter_version = "2.0.0";
  assert.throws(() => registry.resolve(wrongAdapter, evidenceFor(pkg)), /METHOD_HANDLER_MISMATCH/);
  const badEvidence = {checked: pkg.artifacts.map(a => ({artifact_id: a.id, sha256: "0".repeat(64)}))};
  assert.throws(() => registry.resolve(pkg, badEvidence), /METHOD_HANDLER_MISMATCH/);
});

test("an unknown method id gets no handler", () => {
  const pkg = readPackage("ttf_atf_10");
  assert.equal(pinnedApprovedHandler().resolve({...pkg, method_id: "unknown_method"}, evidenceFor(pkg)), null);
});
