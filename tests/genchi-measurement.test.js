"use strict";
// Genchi breath-hold: sex-dependent thresholds from the owner's passport (max exclusive).
const {test} = require("node:test"), assert = require("node:assert/strict");
const {scoreGenchi, ratingFor, readMeasurement, scoreGenchiResponses, genchiMeasurementModule, GENCHI_KEY, GENCHI_KEY_DIGEST} = require("../dist/src/scoring/genchi-measurement.js");
const {genchiReleasePackage} = require("../storage/genchi-release.js");
test("Genchi: male thresholds switch exactly at 20, 30 and 40 seconds", () => {
  assert.equal(ratingFor("male", 0), "неудовлетворительно");
  assert.equal(ratingFor("male", 19), "неудовлетворительно");
  assert.equal(ratingFor("male", 20), "удовлетворительно");
  assert.equal(ratingFor("male", 29), "удовлетворительно");
  assert.equal(ratingFor("male", 30), "хорошо");
  assert.equal(ratingFor("male", 39), "хорошо");
  assert.equal(ratingFor("male", 40), "отлично");
  assert.equal(ratingFor("male", 600), "отлично");
});
test("Genchi: female thresholds switch exactly at 15, 20 and 30 seconds", () => {
  assert.equal(ratingFor("female", 14), "неудовлетворительно");
  assert.equal(ratingFor("female", 15), "удовлетворительно");
  assert.equal(ratingFor("female", 19), "удовлетворительно");
  assert.equal(ratingFor("female", 20), "хорошо");
  assert.equal(ratingFor("female", 29), "хорошо");
  assert.equal(ratingFor("female", 30), "отлично");
});
test("Genchi: missing sex, negative, fractional and too long durations are rejected", () => {
  for (const bad of [{duration_seconds: 20}, {sex: "male"}, {duration_seconds: -1, sex: "male"}, {duration_seconds: 20.5, sex: "female"},
    {duration_seconds: 601, sex: "male"}, {duration_seconds: "20", sex: "male"}, null, []])
    assert.throws(() => readMeasurement(bad), /GENCHI_/);
});
test("Genchi: the scored result carries seconds and rating only", () => {
  const result = scoreGenchi({duration_seconds: 25, sex: "female"});
  assert.deepEqual(result, {duration_seconds: 25, rating: "хорошо"});
});

test("Genchi: release digest pins the registered handler key", () => {
  const release = genchiReleasePackage();
  assert.equal(release.keyDigest, GENCHI_KEY_DIGEST);
  assert.match(release.formDigest, /^sha256:[a-f0-9]{64}$/);
  assert.equal(release.form.items.length, 2);
  assert.equal(release.form.items[0].options.length, 601);
  assert.equal(release.form.presentation.id, "pedpsy/breath-hold");
});
test("Genchi: q01/q02 responses produce a scored instrument result", () => {
  const request = {contract_version: "1.0", method_version_id: "genchi_breath_hold@1.0.0", handler_version: "genchi-measurement-1.0.0",
    responses: [{item_id: "q01", value: "25"}, {item_id: "q02", value: "female"}]};
  const result = scoreGenchiResponses(request);
  assert.equal(result.status, "scored");
  assert.deepEqual(result.measures[0], {code: "duration_seconds", label: "Время задержки дыхания, с", value: 25,
    value_type: "number", representation: "raw", precision: 0});
  assert.deepEqual(result.classifications[0], {code: "rating", label: "Оценка", value: "хорошо", basis: "genchi_thresholds"});
  assert.equal(result.calculation.key_digest, GENCHI_KEY_DIGEST);
  assert.equal(genchiMeasurementModule.calculate(request).status, "scored");
  assert.equal(scoreGenchiResponses({...request, responses: [{item_id: "q01", value: "25"}]}).status, "invalid");
  assert.equal(scoreGenchiResponses({...request, responses: [{item_id: "q01", value: "25"}, {item_id: "q02", value: "other"}]}).status, "invalid");
  assert.equal(scoreGenchiResponses({...request, responses: [{item_id: "q01", value: "601"}, {item_id: "q02", value: "male"}]}).status, "invalid");
});

test("Genchi: key file mirrors the calculation core", () => {
  const fs = require("node:fs"), path = require("node:path");
  const mirrored = JSON.parse(fs.readFileSync(path.join(__dirname, "../methods/genchi/key.json"), "utf8"));
  assert.deepEqual(mirrored, GENCHI_KEY);
});
