"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");

const app=fs.readFileSync(path.join(__dirname,"../web/workspace/app.js"),"utf8");
const html=fs.readFileSync(path.join(__dirname,"../web/workspace/index.html"),"utf8");

test("method dashboard toggles the panel by id, not by element",()=>{
  assert.match(html,/id="method-progress-panel"/);
  assert.match(html,/id="method-progress-list"/);
  assert.match(html,/id="method-progress-summary"/);
  assert.doesNotMatch(app,/show\(panel,/);
  assert.match(app,/show\("method-progress-panel",false\)/);
  assert.match(app,/show\("method-progress-panel",true\)/);
});
