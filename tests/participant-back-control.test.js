"use strict";
const {test} = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("the participant stage screen uses a clear back control instead of a bottom action", () => {
  const script = fs.readFileSync(path.join(__dirname, "..", "web", "workspace", "participant.js"), "utf8");
  assert.match(script, /id="methods-back" class="back-button"/);
  assert.match(script, /aria-label="Назад к этапам"/);
  assert.match(script, /← Назад/);
  assert.doesNotMatch(script, />К этапам</);
  const css = fs.readFileSync(path.join(__dirname, "..", "web", "workspace", "styles.css"), "utf8");
  assert.match(css, /\.back-button\{/);
});
