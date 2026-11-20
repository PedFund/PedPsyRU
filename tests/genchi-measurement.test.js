"use strict";
// Genchi breath-hold: sex-dependent thresholds from the owner's passport (max exclusive).
const {test} = require("node:test"), assert = require("node:assert/strict");
const {scoreGenchi, ratingFor, readMeasurement} = require("../dist/src/scoring/genchi-measurement.js");
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
