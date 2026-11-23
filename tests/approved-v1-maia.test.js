"use strict";
// MAIA-R control vectors: eight means on the author's 0..5 scale, reverse items 5..9
// recoded as "5 - response", one-decimal rounding before level assignment.
const {test} = require("node:test"), assert = require("node:assert/strict");
const {scoreNumericPassport} = require("../core/numeric-passport.js");
const key = require("../methods/approved/v1/keys/maia_r_32.key.json");
const answers = value => Array.from({length: 32}, () => value);
const score = responses => scoreNumericPassport(key, responses).metrics;
test("the reconciled key accepts and stores the author's 0..5 codes directly", () => {
  assert.deepEqual(key.valid, [0, 1, 2, 3, 4, 5]);
  assert.equal(key.answerMap, undefined);
  assert.equal(key.scoreRange[0], 0);
  assert.equal(key.scoreRange[1], 5);
});
test("all answers at the lowest option give direct means 0 and reverse means 5", () => {
  const result = score(answers(0));
  assert.equal(result.noticing, 0);
  assert.equal(result.not_distracting, 5);
  assert.equal(result.not_worrying, 3.33);
  assert.equal(result.attention_regulation, 0);
  assert.equal(result.emotional_awareness_negative, 0);
  assert.equal(result.emotional_awareness_positive, 0);
  assert.equal(result.body_listening, 0);
  assert.equal(result.trusting, 0);
});
test("all answers at the highest option give direct means 5 and reverse means 0", () => {
  const result = score(answers(5));
  assert.equal(result.noticing, 5);
  assert.equal(result.not_distracting, 0);
  assert.equal(result.not_worrying, 1.67);
  assert.equal(result.attention_regulation, 5);
  assert.equal(result.body_listening, 5);
  assert.equal(result.trusting, 5);
});
test("levels follow the platform intervals with one-decimal rounding before lookup", () => {
  const low = score(answers(0));
  assert.equal(low["noticing – уровень"], "Низкий");
  assert.equal(low["not_distracting – уровень"], "Высокий");
  // 10/3 = 3.33 falls into the 2.7..3.7 interval of S3.
  assert.equal(low["not_worrying – уровень"], "Выше среднего");
  const high = score(answers(5));
  assert.equal(high["noticing – уровень"], "Высокий");
  assert.equal(high["not_distracting – уровень"], "Низкий");
  // 5/3 = 1.67 rounds to 1.7, the inclusive upper bound of the 0.7..1.7 interval.
  assert.equal(high["not_worrying – уровень"], "Ниже среднего");
  // S6 and S8 have four levels: the top interval is "Выше среднего", there is no "Высокий".
  assert.equal(high["emotional_awareness_positive – уровень"], "Выше среднего");
  assert.equal(high["trusting – уровень"], "Выше среднего");
});
test("one-decimal rounding can move a mean across a level boundary", () => {
  // S6 items 4, 21, 22 answer 4, 4, 5: the mean is 4.33, which rounds to 4.3 before the
  // lookup and therefore stays in "Средний" (3.3 < X <= 4.3); without rounding it would
  // fall into "Выше среднего".
  const responses = answers(0);
  responses[3] = 4; responses[20] = 4; responses[21] = 5;
  const result = score(responses);
  assert.equal(result.emotional_awareness_positive, 4.33);
  assert.equal(result["emotional_awareness_positive – уровень"], "Средний");
});
test("every subscale has its own interval table and all 32 items belong to exactly one scale", () => {
  const assigned = new Map();
  for (const [id, scale] of Object.entries(key.scales)) {
    assert.ok(key.levels[id], "levels for " + id);
    for (const row of key.levels[id]) assert.equal(row.length, 3);
    for (const number of scale.direct || []) assigned.set(number, id);
    for (const number of scale.reverse || []) assigned.set(number, id);
  }
  assert.equal(assigned.size, 32);
  assert.deepEqual([...assigned.keys()].sort((a, b) => a - b), Array.from({length: 32}, (_, index) => index + 1));
});
test("reverse items are exactly 5..9 and recoded as 5 - response", () => {
  const reverse = [];
  for (const scale of Object.values(key.scales)) for (const number of scale.reverse || []) reverse.push(number);
  assert.deepEqual(reverse.sort((a, b) => a - b), [5, 6, 7, 8, 9]);
  const single = answers(0); single[4] = 5; // item 5 answered with the highest option (score 5)
  assert.equal(score(single).not_distracting, 3.33);
});
