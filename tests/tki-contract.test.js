"use strict";

const assert = require("node:assert/strict");
const {test} = require("node:test");
const fixture = require("./fixtures/tki-reference.json");
const Methods = require("../methods.js");
const Processor = require("../processor.js");
const Contract = require("../core/tki-contract.js");
const labels = ["Соперничество", "Сотрудничество", "Компромисс", "Избегание", "Приспособление"];
const correctedKey = require("../methods/tki/keys/1.0.0.json");
const request = (answers = Array(30).fill("B")) => ({
  contract_version: Contract.CONTRACT_VERSION,
  method_version_id: Contract.METHOD_VERSION_ID,
  handler_version: Contract.HANDLER_VERSION,
  responses: answers.map((value, index) => ({item_id: "q" + String(index + 1).padStart(2, "0"), value}))
});
const referenceScore = answers => {
  const scores = Object.fromEntries(fixture.scale_order.map(code => [code, 0]));
  answers.forEach((value, index) => scores[fixture.reference_pair_scales[index][value === "A" ? 0 : 1]]++);
  return fixture.scale_order.map(code => scores[code]);
};

test("published reference has exactly 60 unique alternatives, 12 per scale", () => {
  assert.equal(fixture.reference_pair_scales.length, 30);
  const counts = Object.fromEntries(fixture.scale_order.map(code => [code, 0]));
  for (const pair of fixture.reference_pair_scales) {
    assert.equal(pair.length, 2);
    assert.notEqual(pair[0], pair[1]);
    for (const code of pair) {assert.ok(code in counts); counts[code]++;}
  }
  assert.deepEqual(Object.values(counts), [12, 12, 12, 12, 12]);
});

test("incomplete, unknown, duplicate and noncanonical responses never produce scores", () => {
  const cases = [
    [null, "invalid", "INVALID_REQUEST"],
    [{...request(), responses: null}, "invalid", "INVALID_RESPONSES"],
    [{...request(), responses: request().responses.slice(1)}, "incomplete", "MISSING_ANSWERS"],
    [{...request(), responses: [...request().responses, {item_id: "q01", value: "A"}]}, "invalid", "DUPLICATE_ITEM"],
    [{...request(), responses: [{item_id: "q31", value: "A"}]}, "invalid", "UNKNOWN_ITEM"]
  ];
  for (const value of [null, "", "C", "А", "Б", "a", "A) текст", 1, true]) {
    const input = request(); input.responses[0].value = value;
    cases.push([input, "invalid", "INVALID_ANSWER"]);
  }
  for (const [input, status, code] of cases) {
    const result = Contract.scoreTki(input);
    assert.equal(result.status, status);
    assert.equal(result.warnings[0].code, code);
    assert.deepEqual(result.measures, []);
    assert.equal(result.quality.usable_for_aggregation, false);
  }
});

test("each version identifier must match the supported version", () => {
  for (const field of ["contract_version", "method_version_id", "handler_version"]) {
    const result = Contract.scoreTki({...request(), [field]: "unknown"});
    assert.equal(result.status, "blocked");
    assert.equal(result.warnings[0].code, "UNSUPPORTED_VERSION");
    assert.deepEqual(result.measures, []);
  }
});

test("key 1.0.0 assigns all 60 alternatives to the reference scales, including 21A/B", () => {
  const assignments = new Map();
  for (const [label, key] of Object.entries(correctedKey.scales)) {
    const tokens = key.split(/\s+/);
    assert.equal(tokens.length, 12, label);
    for (const token of tokens) {
      assert.ok(!assignments.has(token), "duplicate alternative " + token);
      assignments.set(token, fixture.scale_order[labels.indexOf(label)]);
    }
  }
  assert.equal(assignments.size, 60);
  fixture.reference_pair_scales.forEach((pair, index) => {
    for (const [offset, alternative] of ["A", "B"].entries()) {
      assert.equal(assignments.get(String(index + 1) + alternative), pair[offset], String(index + 1) + alternative);
    }
  });
  assert.equal(assignments.get("21A"), "accommodating");
  assert.equal(assignments.get("21B"), "collaborating");
});

test("verified key returns fixed profiles without warnings", () => {
  for (const profile of fixture.profiles) {
    const input = request([...profile.answers]);
    const before = JSON.stringify(input);
    const result = Contract.scoreTki(input);
    assert.equal(result.status, "scored");
    assert.equal(result.method_version_id, "tki_ru_30_pairs@1.0.0");
    assert.equal(result.handler_version, "tki-contract-0.3.0");
    assert.deepEqual(result.measures.map(measure => measure.value), profile.expected);
    assert.deepEqual(result.measures.map(measure => measure.code), fixture.scale_order);
    assert.equal(result.validation_state, "key_verified");
    assert.equal(result.quality.usable_for_aggregation, true);
    assert.deepEqual(result.warnings, []);
    assert.deepEqual(result.classifications, []);
    assert.equal(JSON.stringify(input), before);
    input.responses.reverse();
    assert.deepEqual(Contract.scoreTki(input), result);
  }
});

test("switching each pair B to A matches the reference", () => {
  for (let index = 0; index < 30; index++) {
    const answers = Array(30).fill("B"); answers[index] = "A";
    const current = Contract.scoreTki(request(answers)).measures.map(measure => measure.value);
    assert.deepEqual(current, referenceScore(answers), "pair " + (index + 1));
  }
});

test("each corrected scale reaches both 0 and 12; all complete profiles sum to 30", () => {
  for (const [scaleIndex, code] of fixture.scale_order.entries()) {
    for (const maximize of [true, false]) {
      const answers = fixture.reference_pair_scales.map(pair => {
        const offset = maximize ? pair.indexOf(code) : pair.findIndex(candidate => candidate !== code);
        return offset === 1 ? "B" : "A";
      });
      const result = Contract.scoreTki(request(answers));
      assert.equal(result.status, "scored");
      const scores = result.measures.map(measure => measure.value);
      assert.equal(scores[scaleIndex], maximize ? 12 : 0, code);
      assert.equal(scores.reduce((sum, value) => sum + value, 0), 30);
      assert.ok(scores.every(value => value >= 0 && value <= 12));
    }
  }
});

test("obsolete version identifiers and exports are unavailable", () => {
  assert.equal("LEGACY_METHOD_VERSION_ID" in Contract, false);
  assert.equal("LEGACY_HANDLER_VERSION" in Contract, false);
  for (const versions of [
    {method_version_id: "tki_ru_30_pairs@legacy-5.5.8-draft", handler_version: "tki-contract-0.1.0"},
    {method_version_id: Contract.METHOD_VERSION_ID, handler_version: "tki-contract-0.1.0"},
    {method_version_id: "tki_ru_30_pairs@legacy-5.5.8-draft", handler_version: Contract.HANDLER_VERSION},
    {method_version_id: Contract.METHOD_VERSION_ID, handler_version: "tki-contract-0.2.0"}
  ]) {
    const result = Contract.scoreTki({...request(), ...versions});
    assert.equal(result.status, "blocked");
    assert.equal(result.warnings[0].code, "UNSUPPORTED_VERSION");
    assert.deepEqual(result.measures, []);
    assert.equal(result.quality.usable_for_aggregation, false);
  }
});

test("copied catalogs do not contain an obsolete TKI key", () => {
  const BuiltIn = require("../methods/builtin.js");
  assert.equal(Methods.byId.tki_ru_30_pairs, undefined);
  assert.equal(BuiltIn.byId.tki_ru_30_pairs, undefined);
  assert.equal(Methods.methods.some(method => method.id === correctedKey.id), false);
  assert.equal(BuiltIn.methods.some(method => method.id === correctedKey.id), false);
  assert.equal(BuiltIn.metricGuidance.tki_ru_30_pairs, undefined);
});

test("changed verified key blocks scoring until restored", () => {
  const original = correctedKey.scales.Соперничество;
  try {
    correctedKey.scales.Соперничество += " 1A";
    const result = Contract.scoreTki(request());
    assert.equal(result.status, "blocked");
    assert.equal(result.warnings[0].code, "KEY_SNAPSHOT_CHANGED");
    assert.deepEqual(result.measures, []);
    assert.equal(result.quality.usable_for_aggregation, false);
  } finally {correctedKey.scales.Соперничество = original;}
  assert.equal(Contract.scoreTki(request()).status, "scored");
});

test("existing forced-choice engine scores the verified JSON directly", () => {
  const result = Processor.scoreComplete(correctedKey, Array(30).fill("A"));
  assert.equal(result.status, "Обработано");
  assert.deepEqual(labels.map(label => result.metrics[label]), [6, 6, 6, 6, 6]);
});
