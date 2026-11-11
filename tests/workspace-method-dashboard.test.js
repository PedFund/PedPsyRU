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
  assert.match(html,/id="method-progress-group"/);
  assert.match(html,/id="method-progress-stage"/);
  assert.match(html,/id="progress-invite-panel"/);
  assert.match(html,/id="copy-progress-invite"/);
  assert.match(html,/id="participant-stats-panel"/);
  assert.match(app,/loadParticipantStats/);
  assert.match(app,/loadParticipantStats.*workbenchPath\(\)\+"\/progress\/participants"/);
  assert.match(app,/passport-stat-card/);
  assert.doesNotMatch(app,/\["sex","education","city","organization"\]/);
  assert.match(app,/study-methods-section"\)\.append\(\$\("group-invitations-panel"\)\)/);
  assert.doesNotMatch(app,/study-progress-section"\)\.append\([^)]*group-invitations-panel/);
  assert.match(app,/completion-ring/);
  assert.match(app,/level-columns/);
  assert.match(app,/scale-track/);
  assert.match(app,/analytics-legend/);
  assert.match(app,/скрыто \(<3\)/);
});
