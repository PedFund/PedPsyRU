"use strict";
// The generated declarative keys must reproduce the Issue #69/#75 control vectors exactly.
// A key that cannot reproduce them is not usable as a release basis.
const {test} = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {scoreNumericPassport} = require("../core/numeric-passport.js");

const keyDir = path.join(__dirname, "..", "methods", "approved", "v1", "keys");
const key = id => JSON.parse(fs.readFileSync(path.join(keyDir, id + ".key.json"), "utf8"));
const repeat = (count, value) => Array.from({length: count}, () => value);
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 0.006, String(actual) + " != " + String(expected));

test("Shipilov key maps the six UI choices and preserves approved ranges", () => {
  const k = key("uvlk_shipilov");
  assert.equal(k.answerMap["5"], 0); assert.equal(k.answerMap["6"], 0);
  const zero = scoreNumericPassport(k, repeat(36, 1)).metrics;
  assert.equal(zero.total, 0); assert.equal(zero["total – уровень"], "extremely_low");
  const max = scoreNumericPassport(k, repeat(36, 4)).metrics;
  for (const id of ["motivational", "moral", "unrealized_desire", "role", "adaptation", "inadequate_self_esteem"]) assert.equal(max[id], 18, id);
  assert.equal(max.motivational_sphere, 54); assert.equal(max.total, 108); assert.equal(max["total – уровень"], "very_high");
  assert.equal(scoreNumericPassport(k, repeat(36, 6)).metrics.total, 0);
});

test("Karpov key keeps the corrected sten table and the 110 -> sten 3 boundary", () => {
  const k = key("reflexivity_karpov_27");
  const responses = repeat(27, 4); responses[0] = 6;
  const metrics = scoreNumericPassport(k, responses).metrics;
  assert.equal(metrics.reflexivity, 110);
  assert.equal(metrics["reflexivity – стен"], 3);
  assert.equal(metrics["reflexivity – стен – уровень"], "low");
  for (const [raw, expected] of [[100, 1], [101, 2], [107, 2], [108, 3], [113, 3], [189, 10]]) {
    const seen = k.norms.reflexivity.ranges.find(([lo, hi]) => (lo == null || raw >= lo) && (hi == null || raw <= hi))[2];
    assert.equal(seen, expected, String(raw));
  }
});

test("SJO key reproduces the approved direction and level boundaries", () => {
  const k = key("sjo_20");
  const metrics = scoreNumericPassport(k, repeat(20, 1)).metrics;
  assert.equal(metrics.meaningfulness_total, 86);
  assert.equal(metrics["meaningfulness_total – уровень"], "low");
  for (const [name, rows] of Object.entries(k.levels)) {
    for (const [min, max, label] of rows) {
      assert.equal(scoreNumericPassport(k, repeat(20, 1)).metrics["meaningfulness_total – уровень"], "low", name + ":" + min);
    }
  }
});

test("Hardiness key reproduces the 28/29/20/77 vector without inventing levels", () => {
  const k = key("hardiness_leontiev_rasskazova_45");
  const metrics = scoreNumericPassport(k, repeat(45, 1)).metrics;
  assert.deepEqual({commitment: metrics.commitment, control: metrics.control, challenge: metrics.challenge, total: metrics.total_hardiness},
    {commitment: 33, control: 33, challenge: 24, total: 90});
  const levelFor = (name, value) => {
    const ranges = k.levels[name];
    const row = ranges.find(([lo, hi, , mode]) => (lo == null || value >= lo) && (hi == null || value <= hi) && mode !== "max_exclusive");
    return row && row[2];
  };
  assert.equal(levelFor("commitment", 28), "low");
  assert.equal(levelFor("control", 29), "medium");
  assert.equal(levelFor("challenge", 20), "high");
  assert.equal(levelFor("total_hardiness", 77), "medium");
});

test("Q-LES-Q key reverses only 21, 33 and 35 and keeps item 28 direct", () => {
  const k = key("qlesq_36_vodopyanova");
  assert.deepEqual(k.scales.optimism.reverse, [35]);
  assert.deepEqual(k.scales.self_control.reverse, [21]);
  assert.deepEqual(k.scales.negative_emotions.reverse, [33]);
  assert.ok(!JSON.stringify(k).includes('"reverse":[28]'));
  const base = repeat(36, 5);
  const a = scoreNumericPassport(k, base).metrics;
  near(a.quality_of_life_index, 183 / 9);
  assert.equal(a["quality_of_life_index – уровень"], "low");
  const changed = base.slice(); changed[27] = 10;
  const b = scoreNumericPassport(k, changed).metrics;
  near(b.optimism - a.optimism, 5);
  near(b.quality_of_life_index - a.quality_of_life_index, 5 / 9);
});

test("CO-36 key enforces the required scarce-value quotas before averaging", () => {
  const k = key("co36_kunitsyna_36");
  const responses = repeat(36, 2);
  [responses[0], responses[1], responses[2], responses[3], responses[4], responses[5], responses[6]] = [12, 11, 11, 10, 10, 10, 1];
  const metrics = scoreNumericPassport(k, responses).metrics;
  assert.equal(Object.keys(k.scales).length, 12);
  near(metrics.family_safety, (12 + 1 + 2) / 3);
  const invalid = responses.slice(); invalid[7] = 12;
  assert.throws(() => scoreNumericPassport(k, invalid), /Quota violated/);
});

test("PVQ-RR key produces 19 uncentered means and four higher-order vectors without rounding", () => {
  const k = key("pvq_rr_57");
  assert.equal(k.fullPrecision, true);
  const target = {BED: 11, BEC: 11, UNC: 12, UNN: 12, UNT: 12, HE: 12, AC: 11, FOR: 12, FOD: 12, FAC: 12,
    SDT: 10, SDA: 11, ST: 11, SES: 11, SEP: 11, COR: 11, COI: 11, TR: 12, HUM: 12};
  const responses = repeat(57, 1);
  for (const [id, sum] of Object.entries(target)) {
    const items = [...(k.scales[id].direct || []), ...(k.scales[id].reverse || [])];
    const base = Math.floor(sum / 3), rest = sum - base * 3, values = [base, base, base];
    for (let i = 0; i < rest; i++) values[i]++;
    items.forEach((item, index) => { responses[item - 1] = values[index]; });
  }
  const metrics = scoreNumericPassport(k, responses).metrics;
  assert.equal(Object.keys(k.scales).length, 19);
  near(metrics.self_transcendence, 58 / 15);
  near(metrics.self_enhancement, 59 / 15);
  near(metrics.openness_to_change, 44 / 12);
  near(metrics.conservation, 80 / 21);
});

test("Motkov key reproduces the owner's processed example and the full Gpk table", () => {
  const k = key("motkov_psychological_culture_18");
  const responses = repeat(36, 1);
  const put = (items, values) => items.forEach((item, index) => { responses[item - 1] = values[index]; });
  put([1, 13, 25], [3, 4, 4]);
  put([3, 15, 27], [3, 4, 4]);
  put([5, 17, 29], [3, 4, 4]);
  put([7, 19, 31], [4, 4, 5]);
  put([9, 21, 33], [4, 4, 5]);
  put([11, 23, 35], [3, 4, 4]);
  put([2, 14, 26], [1, 2, 2]);
  put([4, 16, 28], [1, 2, 2]);
  put([6, 18, 30], [2, 2, 2]);
  put([8, 20, 32], [1, 2, 2]);
  put([10, 22, 34], [2, 2, 2]);
  put([12, 24, 36], [2, 2, 2]);
  const metrics = scoreNumericPassport(k, responses).metrics;
  assert.equal(Object.keys(k.scales).length, 14);
  assert.deepEqual({
    I_A: metrics.I_A, II_A: metrics.II_A, III_A: metrics.III_A, IV_A: metrics.IV_A, V_A: metrics.V_A, VI_A: metrics.VI_A,
    I_B: metrics.I_B, II_B: metrics.II_B, III_B: metrics.III_B, IV_B: metrics.IV_B, V_B: metrics.V_B, VI_B: metrics.VI_B,
    pk_A: metrics.pk_A, pk_B: metrics.pk_B
  }, {I_A: 3.67, II_A: 3.67, III_A: 3.67, IV_A: 4.33, V_A: 4.33, VI_A: 3.67,
    I_B: 1.67, II_B: 1.67, III_B: 2, IV_B: 1.67, V_B: 2, VI_B: 2, pk_A: 3.89, pk_B: 1.83});
  assert.equal(metrics["I_A – уровень"], "средний");
  assert.equal(metrics["IV_A – уровень"], "высокий");
  assert.equal(metrics["I_B – уровень"], "низкий");
  assert.equal(metrics["pk_A – уровень"], "средний");
  assert.equal(metrics["pk_B – уровень"], "низкий");
  assert.equal(metrics["gpk – уровень"], "низкий");
  assert.deepEqual(k.crossLevels.gpk.table, {
    "низкий": {"низкий": "низкий", "средний": "средний", "высокий": "средний", "псевдовысокий": "средний"},
    "средний": {"низкий": "низкий", "средний": "средний", "высокий": "высокий", "псевдовысокий": "псевдовысокий"},
    "высокий": {"низкий": "низкий", "средний": "средний", "высокий": "высокий", "псевдовысокий": "псевдовысокий"},
    "псевдовысокий": {"низкий": "низкий", "средний": "средний", "высокий": "высокий", "псевдовысокий": "псевдовысокий"}
  });
});

test("TTF/ATF key uses approved directions and declares no norms", () => {
  const k = key("ttf_atf_10");
  assert.equal(k.norms, undefined);
  const minimum = repeat(10, 1); for (const i of [2, 3, 6, 8, 9]) minimum[i - 1] = 7;
  const maximum = repeat(10, 1); for (const i of [1, 4, 5, 7, 10]) maximum[i - 1] = 7;
  assert.deepEqual(scoreNumericPassport(k, minimum).metrics, {TTF: 4, ATF: 6});
  assert.deepEqual(scoreNumericPassport(k, maximum).metrics, {TTF: 28, ATF: 42});
});

test("every generated key refuses incomplete and out-of-range answers", () => {
  for (const file of fs.readdirSync(keyDir).filter(name => name.endsWith(".key.json"))) {
    const k = JSON.parse(fs.readFileSync(path.join(keyDir, file), "utf8"));
    const good = validVector(k);
    scoreNumericPassport(k, good);
    assert.throws(() => scoreNumericPassport(k, good.slice(1)), /Invalid complete numeric questionnaire/, file);
    const bad = good.slice(); bad[0] = 999;
    assert.throws(() => scoreNumericPassport(k, bad), /Invalid complete numeric questionnaire/, file);
  }
});

function validVector(k) {
  if (!k.quota) return repeat(k.items, k.valid[0]);
  const values = [];
  for (const [value, count] of Object.entries(k.quota)) for (let i = 0; i < count; i++) values.push(Number(value));
  const filler = k.valid.find(value => !(String(value) in k.quota));
  while (values.length < k.items) values.push(filler);
  return values;
}
