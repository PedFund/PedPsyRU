"use strict";
// Universal result cards: only the level-numeric variant is implemented now.
// The category always comes from scoring (the approved level), never from the
// display rounding. Numeric values are rounded for display only.
const {test} = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const result = require("../web/workspace/result-presenter.js");
const {buildPresentation} = require("../dist/src/application/result-presentation.js");
const {scoreNumericPassport} = require("../core/numeric-passport.js");

const MAIA_LABELS = [
  "Наблюдение",
  "Не отвлечение внимания от боли",
  "Отсутствие беспокойства",
  "Регуляция внимания",
  "Осознавание негативного эмоционального состояния",
  "Осознавание позитивного эмоционального состояния",
  "Саморегуляция на основе активного «слушания» тела",
  "Доверие"
];

function viewFor(cards) {
  return {
    variant: "level-numeric",
    heading: null,
    subtitle: "Уровни выраженности показателей интероцептивного осознавания",
    footer_note: "Результаты отражают особенности самооценки и не предназначены для постановки психологического диагноза",
    groups: [{title: "Показатели", measures: cards}]
  };
}

test("score formatting uses one decimal and a Russian comma without touching the source value", () => {
  assert.equal(result.formatScore(3.7), "3,7");
  assert.equal(result.formatScore(2), "2,0");
  assert.equal(result.formatScore(5), "5,0");
  assert.equal(result.formatScore(0), "0,0");
  assert.equal(result.formatScore(3.66), "3,7");
  assert.equal(result.formatScore(3.74), "3,7");
  assert.equal(result.formatScore("4.26"), "4,3");
  const cards = result.levelNumericCards(viewFor([
    {code: "noticing", label: "Наблюдение", value: 3.66, level: "Средний"}
  ]));
  assert.equal(cards[0].value, 3.66);
  assert.equal(cards[0].displayValue, "3,7 балла");
});

test("the level category is the scored level, not a category re-derived from the displayed value", () => {
  const middle = result.markup(viewFor([
    {code: "noticing", label: "Наблюдение", value: 3.74, level: "Средний"}
  ]));
  const high = result.markup(viewFor([
    {code: "noticing", label: "Наблюдение", value: 3.74, level: "Выше среднего"}
  ]));
  assert.match(middle, /3,7 балла/);
  assert.match(middle, /Средний/);
  assert.match(high, /3,7 балла/);
  assert.match(high, /Выше среднего/);
});

test("MAIA-R has all eight official labels, categories and one-decimal values", () => {
  const key = require("../methods/approved/v1/keys/maia_r_32.key.json");
  const answers = Array.from({length: 32}, () => 0);
  const metrics = scoreNumericPassport(key, answers).metrics;
  const codes = Object.keys(key.scales);
  const measures = codes.map(code => ({code, label: code, value: metrics[code]}));
  const levels = new Map(codes.map(code => [code, {value: metrics[code + " – уровень"]}]));
  const view = buildPresentation("maia_r_32@1.0.1-staging", measures, levels);
  assert.ok(view);
  assert.equal(view.variant, "level-numeric");
  assert.equal(view.subtitle, "Уровни выраженности показателей интероцептивного осознавания");
  assert.equal(view.footer_note, "Результаты отражают особенности самооценки и не предназначены для постановки психологического диагноза");
  assert.equal(view.groups[0].measures.length, 8);
  assert.deepEqual(view.groups[0].measures.map(measure => measure.label), MAIA_LABELS);
  assert.deepEqual(view.groups[0].measures.map(measure => measure.level), [
    "Низкий", "Высокий", "Выше среднего", "Низкий", "Низкий", "Низкий", "Низкий", "Низкий"
  ]);
  const html = result.markup(view);
  const cards = result.levelNumericCards(view);
  assert.deepEqual(cards.map(card => card.displayValue), [
    "0,0 балла", "5,0 балла", "3,3 балла", "0,0 балла", "0,0 балла", "0,0 балла", "0,0 балла", "0,0 балла"
  ]);
  assert.match(html, /Ваши результаты/);
  assert.match(html, /Уровень выраженности/);
  assert.match(html, /Выше среднего/);
  assert.doesNotMatch(html, /Уровень:/);
  assert.doesNotMatch(html, /по ключу методики/);
  assert.doesNotMatch(html, /Учебная платформа/);
  assert.doesNotMatch(html, /Selectel/);
  assert.equal((html.match(/id="result-methods"/g) || []).length, 1);
  assert.ok(html.indexOf('id="result-methods"') < html.indexOf("<h2>"));
  assert.match(html, /id="result-methods"[^>]*>К методикам</);
});

test("MAIA-R all-eight result keeps the approved categories on the highest vector", () => {
  const key = require("../methods/approved/v1/keys/maia_r_32.key.json");
  const metrics = scoreNumericPassport(key, Array.from({length: 32}, () => 5)).metrics;
  const codes = Object.keys(key.scales);
  const measures = codes.map(code => ({code, label: code, value: metrics[code]}));
  const levels = new Map(codes.map(code => [code, {value: metrics[code + " – уровень"]}]));
  const view = buildPresentation("maia_r_32@1.0.1-staging", measures, levels);
  assert.deepEqual(view.groups[0].measures.map(measure => measure.level), [
    "Высокий", "Низкий", "Ниже среднего", "Высокий", "Высокий", "Выше среднего", "Высокий", "Выше среднего"
  ]);
  assert.deepEqual(result.levelNumericCards(view).map(card => card.displayValue), [
    "5,0 балла", "0,0 балла", "1,7 балла", "5,0 балла", "5,0 балла", "5,0 балла", "5,0 балла", "5,0 балла"
  ]);
  assert.deepEqual(result.levelNumericCards(view).map(card => card.label), MAIA_LABELS);
});

test("only the level-numeric variant is rendered and the others stay reserved", () => {
  assert.deepEqual(result.VARIANTS, ["profile", "level-only", "level-numeric", "level-graphic", "extended-text"]);
  assert.equal(result.supports({variant: "level-numeric"}), true);
  for (const variant of ["profile", "level-only", "level-graphic", "extended-text"]) {
    assert.equal(result.supports({variant}), false);
    assert.throws(() => result.markup({variant}), /RESULT_VARIANT_UNSUPPORTED/);
  }
});

test("the participant screen hides technical chrome on results and keeps one top back button", () => {
  const js = fs.readFileSync(path.join(__dirname, "../web/workspace/participant.js"), "utf8");
  const html = fs.readFileSync(path.join(__dirname, "../web/workspace/index.html"), "utf8");
  assert.doesNotMatch(js, /Перечитать с сервера/);
  assert.doesNotMatch(js, /id="participant-refresh"/);
  assert.match(js, /id="participant-toolbar"/);
  assert.match(js, /hideParticipantToolbar\(\)/);
  assert.match(js, /showParticipantToolbar\(\)/);
  assert.match(js, /resultApi\.supports\(presentation\)/);
  assert.match(js, /class="result-toolbar"[^]*?К методикам/);
  assert.doesNotMatch(js, /<\/section>'\+'<button id="result-methods"/);
  assert.doesNotMatch(html, /Учебная платформа/);
  assert.doesNotMatch(html, /Selectel/);
  assert.doesNotMatch(html, /design-warning/);
  assert.doesNotMatch(html, /class="note"/);
});

test("the workspace bundle includes the result presenter", () => {
  const {workspaceAssets} = require("../dist/src/bootstrap/workspace-assets.js");
  assert.match(workspaceAssets().participantJs, /PedPsyResult/);
  assert.match(workspaceAssets().participantJs, /level-numeric/);
});
