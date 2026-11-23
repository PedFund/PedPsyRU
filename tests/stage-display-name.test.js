"use strict";
// Stage code and participant-facing name are separate. The UI must read the name
// from the stage DTO and fall back to the code, never invent a default stage name.
const {test} = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function file(name) {
  return fs.readFileSync(path.join(__dirname, "..", name), "utf8");
}

test("the participant overview puts available stages first and uses the researcher name", () => {
  const js = file("web/workspace/participant.js");
  assert.match(js, /Доступные этапы исследования/);
  assert.match(js, /Сведения и согласия/);
  assert.match(js, /s\.display_name\|\|s\.code/);
  assert.match(js, /participant-stage-name/);
  assert.match(js, /participant-stage-code/);
  assert.match(js, /Заполнены/);
  assert.match(js, /Требуется заполнение/);
  assert.match(js, /Приняты/);
  assert.match(js, /Требуется согласие/);
  assert.match(js, /participant-stage-action/);
  assert.doesNotMatch(js, /Перед началом|Открытые этапы/);
  assert.doesNotMatch(js, /Сведения об участнике и обязательные согласия проверяются сервером/);
  assert.doesNotMatch(js, /Перечитать с сервера/);
});

test("the researcher stage form has the exact label, hint and live preview", () => {
  const html = file("web/workspace/index.html");
  const app = file("web/workspace/app.js");
  assert.match(html, /Название этапа для участника/);
  assert.match(html, /Этот текст будет отображаться в кабинете участника исследования/);
  assert.match(html, /id="stage-display-name"[^>]*maxlength="200"/);
  assert.match(html, /stage-preview-name/);
  assert.match(html, /stage-preview-code/);
  assert.match(app, /function renderStagePreview\(\)/);
  assert.match(app, /display_name:\$\("stage-display-name"\)\.value/);
  assert.match(app, /stage\.display_name\|\|stage\.code/);
});

test("the storage migration is additive and keeps the old snapshot composition", () => {
  const sql = file("storage/postgres/122_stage_display_names.sql");
  assert.match(sql, /ALTER TABLE research_stages ADD COLUMN display_name text/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION study_base_snapshot/);
  assert.match(sql, /'display_name',t\.display_name/);
  assert.match(sql, /CREATE FUNCTION configure_study_stage_named/);
  assert.match(sql, /CREATE FUNCTION copy_study_stage_named/);
  assert.match(sql, /ALTER FUNCTION change_research_workbench\(uuid,integer,text,jsonb\) RENAME TO change_research_workbench_v3/);
});

test("stage styles keep long names and actions inside the card on a phone", () => {
  const css = file("web/workspace/styles.css");
  assert.match(css, /\.participant-stage-name\{[^}]*font-weight:700/);
  assert.match(css, /\.participant-stage-code\{[^}]*font-size:12px/);
  assert.match(css, /\.participant-stage\{[^}]*min-width:0/);
  assert.match(css, /\.participant-stage-name\{[^}]*overflow-wrap:anywhere/);
  assert.match(css, /@media \(max-width:640px\)\{[^}]*\.participant-stage\{flex-direction:column/);
});
