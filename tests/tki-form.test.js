"use strict";
const assert = require("node:assert/strict");
const {test} = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const form = require("../methods/tki/form.json");

test("form contains 30 ordered pairs with stable IDs and exactly A/B", () => {
  assert.equal(form.method_id, "tki_ru_30_pairs");
  assert.equal(form.status, "draft");
  assert.equal(form.items.length, 30);
  assert.deepEqual(form.response_format.choices, ["A", "B"]);
  assert.equal(form.response_format.required, true);
  const ids = new Set();
  form.items.forEach((item, index) => {
    assert.equal(item.number, index + 1);
    assert.equal(item.id, "q" + String(index + 1).padStart(2, "0"));
    assert.ok(!ids.has(item.id)); ids.add(item.id);
    assert.deepEqual(item.options.map(option => option.value), ["A", "B"]);
    assert.deepEqual(item.options.map(option => option.label), ["а", "б"]);
    item.options.forEach(option => {
      assert.equal(typeof option.text, "string");
      assert.ok(option.text.trim());
      assert.ok(option.source_text.trim());
    });
  });
});

test("only 14 respondent gender inflections change; male projection equals supplied text", () => {
  const changed = [];
  const forms = ["настойчив/настойчива", "мог/могла", "внимательным/внимательной", "озабочен/озабочена"];
  for (const item of form.items) for (const option of item.options) {
    if (option.text !== option.source_text) changed.push(item.id + option.value);
    let projected = option.text;
    for (const inflection of forms) projected = projected.replaceAll(inflection, inflection.split("/")[0]);
    assert.equal(projected, option.source_text, item.id + option.value);
    assert.ok(!projected.includes("/"));
  }
  assert.deepEqual(changed, ["q03A", "q03B", "q08A", "q10A", "q11B", "q15A", "q17A", "q18A", "q21A", "q23A", "q25B", "q26B", "q27B", "q28A"]);
});

test("Markdown blank includes all 60 options in the same order", () => {
  const blank = fs.readFileSync(path.join(__dirname, "../methods/tki/BLANK.md"), "utf8");
  assert.equal((blank.match(/^### \d+$/gm) || []).length, 30);
  assert.equal((blank.match(/^- ☐ [аб]\)/gm) || []).length, 60);
  let cursor = 0;
  for (const item of form.items) {
    const heading = blank.indexOf("### " + item.number + "\n", cursor);
    assert.ok(heading >= cursor);
    cursor = heading;
    for (const option of item.options) {
      const found = blank.indexOf("- ☐ " + option.label + ") " + option.text, cursor);
      assert.ok(found >= cursor, item.id + option.value);
      cursor = found + option.text.length;
    }
  }
});

test("form text is separate from keys and source approval remains explicit", () => {
  assert.equal(form.provenance.authority, "user_supplied_text");
  assert.equal(form.provenance.source_verification, "pending");
  assert.equal(form.provenance.scoring_key_verification, "key_verified_1.0.0");
  assert.equal(form.provenance.scoring_key_version_id, "tki_ru_30_pairs@1.0.0");
  assert.equal(form.instruction_status, "technical_draft");
  for (const item of form.items) for (const option of item.options) {
    assert.deepEqual(Object.keys(option).sort(), ["label", "source_text", "text", "value"]);
  }
});
