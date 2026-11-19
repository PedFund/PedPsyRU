"use strict";
// Control vectors for the four owner packages connected on 2026-11-19.
const {test} = require("node:test"), assert = require("node:assert/strict");
const {scoreNumericPassport} = require("../core/numeric-passport.js");
const key = id => require("../methods/approved/v1/keys/" + id + ".key.json");
const score = (id, value) => {
  const k = key(id);
  return scoreNumericPassport(k, Array.from({length: k.items}, (_, index) => value)).metrics;
};
test("FFMQ-39: five sum scales and the total of the five", () => {
  const low = score("ffmq_39", 1);
  assert.equal(low.observe, 8);
  assert.equal(low.describe, 20);
  assert.equal(low.aware_action, 40);
  assert.equal(low.nonjudging, 40);
  assert.equal(low.nonreactivity, 7);
  assert.equal(low.total_5, 8 + 20 + 40 + 40 + 7);
  const high = score("ffmq_39", 5);
  assert.equal(high.observe, 40);
  assert.equal(high.total_5, 40 + 28 + 8 + 8 + 35);
});
test("ШПАНА: two independent sums PA and NA", () => {
  assert.equal(score("shpana_20", 1).PA, 10);
  assert.equal(score("shpana_20", 1).NA, 10);
  assert.equal(score("shpana_20", 5).PA, 50);
  assert.equal(score("shpana_20", 5).NA, 50);
});
test("ECV: 0..10 answers, 10 - x reverse, attention controls are not scored", () => {
  const k = key("ecv_15");
  const answers = Array.from({length: k.items}, () => 1); // ui 1 = score 0
  const low = scoreNumericPassport(k, answers).metrics;
  assert.equal(low.ECV_VALUE, 30);
  assert.equal(low.ECV_EFFICACY, 40);
  // Items 3, 8 and 15 are controls: changing them must not move the scores.
  answers[2] = 11; answers[7] = 11; answers[14] = 11;
  const changed = scoreNumericPassport(k, answers).metrics;
  assert.equal(changed.ECV_VALUE, low.ECV_VALUE);
  assert.equal(changed.ECV_EFFICACY, low.ECV_EFFICACY);
  const high = score("ecv_15", 11);
  assert.equal(high.ECV_VALUE, 30);
  assert.equal(high.ECV_EFFICACY, 20);
});
test("DAR-R: AR, AI and the total with author level tables", () => {
  const low = score("darr_7", 1); // ui 1 = score 0
  assert.equal(low.ar, 0);
  assert.equal(low.ai, 0);
  assert.equal(low.dar_r, 0);
  assert.equal(low["ar – уровень"], "Низкий");
  const high = score("darr_7", 5); // ui 5 = score 4
  assert.equal(high.ar, 16);
  assert.equal(high.ai, 12);
  assert.equal(high.dar_r, 28);
  assert.equal(high["ar – уровень"], "Высокий");
  assert.equal(high["dar_r – уровень"], "Высокий");
});
