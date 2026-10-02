"use strict";
const assert = require("node:assert/strict");
const {test} = require("node:test");
const {summarize, buildRequest} = require("../web/form-model.js");
const form = require("../methods/tki/form.json");
const Contract = require("../core/tki-contract.js");
const versions = {contract_version: Contract.CONTRACT_VERSION, method_version_id: Contract.METHOD_VERSION_ID, handler_version: Contract.HANDLER_VERSION};

test("progress counts canonical answers only, including replacements", () => {
  const answers = Object.create(null);
  assert.equal(summarize(form.items, answers).answered, 0);
  answers.q01 = "A";
  answers.q02 = "Б";
  assert.equal(summarize(form.items, answers).answered, 1);
  answers.q01 = "B";
  assert.equal(summarize(form.items, answers).answered, 1);
  assert.equal(summarize(form.items, answers).missing[0], "q02");
});

test("incomplete form cannot create a scoring request", () => {
  assert.throws(() => buildRequest(form.items, {q01: "A"}, versions), /MISSING_ANSWERS/);
});

test("complete request preserves IDs and versions without copying text or extra fields", () => {
  const answers = Object.fromEntries(form.items.map(item => [item.id, "A"]));
  answers.unknown = "B";
  const before = JSON.stringify(answers);
  const request = buildRequest(form.items, answers, {...versions, secret: "not forwarded"});
  assert.deepEqual(Object.keys(request), ["contract_version", "method_version_id", "handler_version", "responses"]);
  assert.equal(request.responses.length, 30);
  assert.deepEqual(request.responses[20], {item_id: "q21", value: "A"});
  assert.equal(JSON.stringify(answers), before);
  assert.equal(Contract.scoreTki(request).status, "scored");
  assert.deepEqual(Contract.scoreTki(request).measures.map(measure => measure.value), [6, 6, 6, 6, 6]);
});

test("reset state has no responses or complete flag", () => {
  const state = summarize(form.items, {});
  assert.deepEqual(state, {total: 30, answered: 0, missing: form.items.map(item => item.id), complete: false});
});
