"use strict";
// The approved-library packages must be reachable through the trusted runtime registry,
// score their own control vectors there, and stay closed to unknown identities.
const {test} = require("node:test");
const assert = require("node:assert/strict");
const {builtinInstrumentRegistry} = require("../dist/src/scoring/builtin-instrument-modules.js");
const {entries} = require("../core/approved-v1-data.js");

const identityFor = entry => ({contract_version: "1.0", method_version_id: entry.methodVersionId,
  handler_version: "approved-numeric-1.0.0", key_digest: entry.pins.key});
const answers = (entry, value) => Array.from({length: entry.itemCount}, (_, index) => ({
  item_id: "q" + String(index + 1).padStart(2, "0"), value: String(value)}));
const requestFor = (entry, value) => ({contract_version: "1.0", method_version_id: entry.methodVersionId,
  handler_version: "approved-numeric-1.0.0", responses: answers(entry, value)});

test("the registry exposes seven approved packages and deliberately omits CO-36", () => {
  const descriptors = builtinInstrumentRegistry.descriptors();
  const approved = descriptors.filter(d => d.handler_version === "approved-numeric-1.0.0");
  assert.equal(approved.length, 7);
  assert.deepEqual(approved.map(d => d.method_version_id).sort(), [
    "hardiness_leontiev_rasskazova_45@1.0.0-staging", "pvq_rr_57@1.0.0-staging",
    "qlesq_36_vodopyanova@1.1.0-staging", "reflexivity_karpov_27@1.1.0-staging",
    "sjo_20@1.0.0-staging", "ttf_atf_10@1.0.0-staging", "uvlk_shipilov@1.0.0-staging"]);
  assert.equal(descriptors.some(d => d.method_version_id.startsWith("co36_kunitsyna_36")), false);
});

test("Shipilov scores through the registry with the approved numbers", () => {
  const entry = entries.find(e => e.id === "uvlk_shipilov");
  const result = builtinInstrumentRegistry.calculate(identityFor(entry), requestFor(entry, 4));
  assert.equal(result.status, "scored");
  const total = result.measures.find(m => m.label === "total");
  assert.equal(total.value, 108);
  const level = result.classifications.find(c => c.label === "total – уровень");
  assert.equal(level.value, "very_high");
});

test("Karpov 1.1.0 scores 110 as sten 3 through the registry", () => {
  const entry = entries.find(e => e.id === "reflexivity_karpov_27");
  const request = requestFor(entry, 4);
  request.responses[0] = {item_id: "q01", value: "6"};
  const result = builtinInstrumentRegistry.calculate(identityFor(entry), request);
  assert.equal(result.measures.find(m => m.label === "reflexivity").value, 110);
  assert.equal(result.measures.find(m => m.label === "reflexivity – стен").value, 3);
});

test("PVQ-RR keeps full precision through the registry and never rounds", () => {
  const entry = entries.find(e => e.id === "pvq_rr_57");
  const result = builtinInstrumentRegistry.calculate(identityFor(entry), requestFor(entry, 1));
  const openness = result.measures.find(m => m.label === "openness_to_change");
  assert.ok(Math.abs(openness.value - 12 / 12) < Number.EPSILON * 16);
  assert.equal(openness.precision, 4);
});

test("an unknown version, handler or digest is refused by the registry", () => {
  const entry = entries.find(e => e.id === "sjo_20");
  const identity = identityFor(entry);
  const request = requestFor(entry, 1);
  assert.throws(() => builtinInstrumentRegistry.calculate({...identity, method_version_id: "sjo_20@9.9.9"},
    {...request, method_version_id: "sjo_20@9.9.9"}), /METHOD_MODULE_UNAVAILABLE/);
  assert.throws(() => builtinInstrumentRegistry.calculate({...identity, handler_version: "other"},
    {...request, handler_version: "other"}), /METHOD_MODULE_UNAVAILABLE/);
  assert.throws(() => builtinInstrumentRegistry.calculate({...identity, key_digest: "sha256:" + "b".repeat(64)}, request),
    /METHOD_MODULE_UNAVAILABLE/);
});

test("a draft with a missing answer is refused instead of scored", () => {
  const entry = entries.find(e => e.id === "hardiness_leontiev_rasskazova_45");
  const request = requestFor(entry, 0);
  request.responses = request.responses.slice(1);
  assert.throws(() => builtinInstrumentRegistry.calculate(identityFor(entry), request), /INCOMPLETE_OR_INVALID/);
});
