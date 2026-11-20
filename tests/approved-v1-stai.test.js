"use strict";
// Control vectors for STAI (Barkanova 2009 edition, point 23 coded direct).
const {test} = require("node:test"), assert = require("node:assert/strict");
const {scoreNumericPassport} = require("../core/numeric-passport.js");
const key = require("../methods/approved/v1/keys/stai_ru_40_barkanova.key.json");
const answers = value => Array.from({length: key.items}, () => value);
const byDirection = directValue => {
  const reverse = new Set([...key.scales.st.reverse, ...key.scales.lt.reverse]);
  return Array.from({length: key.items}, (_, index) => reverse.has(index + 1) ? 5 - directValue : directValue);
};
test("STAI: all one and all four give 50 on both scales", () => {
  const low = scoreNumericPassport(key, answers(1)).metrics;
  assert.equal(low.st, 50);
  assert.equal(low.lt, 38);
  const high = scoreNumericPassport(key, answers(4)).metrics;
  assert.equal(high.st, 50);
  assert.equal(high.lt, 62);
});
test("STAI: direct-one/reverse-four and direct-four/reverse-one reach 20 and 80", () => {
  const minimal = scoreNumericPassport(key, byDirection(1)).metrics;
  assert.equal(minimal.st, 20);
  assert.equal(minimal.lt, 20);
  assert.equal(minimal["st – уровень"], "Низкая тревожность");
  assert.equal(minimal["lt – уровень"], "Низкая тревожность");
  const maximal = scoreNumericPassport(key, byDirection(4)).metrics;
  assert.equal(maximal.st, 80);
  assert.equal(maximal["st – уровень"], "Высокая тревожность");
});
test("STAI: the key covers all 40 items exactly once", () => {
  const all = [...key.scales.st.direct, ...key.scales.st.reverse, ...key.scales.lt.direct, ...key.scales.lt.reverse].sort((a, b) => a - b);
  assert.deepEqual(all, Array.from({length: 40}, (_, index) => index + 1));
});
