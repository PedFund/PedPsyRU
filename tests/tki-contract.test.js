"use strict";

const assert = require("node:assert/strict");
const {test} = require("node:test");
const fixture = require("./fixtures/tki-reference.json");
const Methods = require("../methods.js");
const Processor = require("../processor.js");
const Contract = require("../core/tki-contract.js");
const labels = ["Соперничество", "Сотрудничество", "Компромисс", "Избегание", "Приспособление"];
const method = Methods.byId.tki_ru_30_pairs;
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
const legacyScore = answers => {
  const result = Processor.scoreComplete(method, answers);
  assert.equal(result.status, "Обработано");
  return labels.map(label => result.metrics[label]);
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

test("all 60 legacy alternatives are assigned once; source conflict is q21 A", () => {
  const assignments = new Map();
  for (const [label, key] of Object.entries(method.scales)) {
    for (const token of key.split(/\s+/)) {
      assert.ok(!assignments.has(token), "duplicate alternative " + token);
      assignments.set(token, fixture.scale_order[labels.indexOf(label)]);
    }
  }
  assert.equal(assignments.size, 60);
  const differences = [];
  fixture.reference_pair_scales.forEach((pair, index) => {
    ["A", "B"].forEach((alternative, offset) => {
      const legacy = assignments.get(String(index + 1) + alternative);
      assert.ok(legacy);
      if (legacy !== pair[offset]) differences.push({item_id: "q" + String(index + 1).padStart(2, "0"), alternative, legacy, reference: pair[offset]});
    });
  });
  assert.deepEqual(differences, [fixture.known_legacy_difference]);
});

test("three fixed synthetic profiles preserve legacy behavior and flag verification", () => {
  for (const profile of fixture.legacy_profiles) {
    const input = request([...profile.answers]);
    const before = JSON.stringify(input);
    const result = Contract.scoreTki(input);
    assert.equal(result.status, "scored", profile.id);
    assert.deepEqual(result.measures.map(measure => measure.value), profile.expected);
    assert.deepEqual(result.measures.map(measure => measure.code), fixture.scale_order);
    assert.equal(result.measures.reduce((sum, measure) => sum + measure.value, 0), 30);
    assert.equal(result.quality.usable_for_aggregation, false);
    assert.equal(result.validation_state, "requires_source_verification");
    assert.equal(result.warnings[0].code, "KEY_SOURCE_CONFLICT");
    assert.deepEqual(result.classifications, []);
    assert.equal(JSON.stringify(input), before);
    assert.deepEqual(Contract.scoreTki(input), result);
    input.responses.reverse();
    assert.deepEqual(Contract.scoreTki(input), result, "item IDs, not array order, define positions");
  }
});

test("one-at-a-time changes isolate the numeric consequence of q21 A", () => {
  for (let index = 0; index < 30; index++) {
    const answers = Array(30).fill("B"); answers[index] = "A";
    const expected = referenceScore(answers);
    const actual = legacyScore(answers);
    if (index === 20) {
      assert.deepEqual(actual.map((value, i) => value - expected[i]), [0, 0, 0, 1, -1]);
    } else assert.deepEqual(actual, expected, "question " + (index + 1));
  }
});

test("extreme profiles expose legacy bounds 12/12/12/13/11", () => {
  const maxima = [];
  for (const label of labels) {
    const key = new Set(method.scales[label].split(/\s+/));
    const answers = Array.from({length: 30}, (_, index) => key.has(String(index + 1) + "A") ? "A" : "B");
    const scores = legacyScore(answers);
    maxima.push(scores[labels.indexOf(label)]);
    assert.equal(scores.reduce((sum, value) => sum + value, 0), 30);
  }
  assert.deepEqual(maxima, [12, 12, 12, 13, 11]);
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

test("each version identifier must match the pinned draft", () => {
  for (const field of ["contract_version", "method_version_id", "handler_version"]) {
    const result = Contract.scoreTki({...request(), [field]: "unknown"});
    assert.equal(result.status, "blocked");
    assert.equal(result.warnings[0].code, "UNSUPPORTED_VERSION");
    assert.deepEqual(result.measures, []);
  }
});

test("a changed key cannot silently retain the draft version", () => {
  const previous = method.scales.Соперничество;
  try {
    method.scales.Соперничество += " 1A";
    const result = Contract.scoreTki(request());
    assert.equal(result.status, "blocked");
    assert.equal(result.warnings[0].code, "KEY_SNAPSHOT_CHANGED");
    assert.deepEqual(result.measures, []);
  } finally {method.scales.Соперничество = previous;}
});
