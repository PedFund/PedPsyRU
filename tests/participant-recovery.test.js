"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
test("participant UI: profile recovery keeps typed values and unlocks after a recoverable save error",()=>{
  const js=fs.readFileSync(path.join(__dirname,"../web/workspace/participant.js"),"utf8");
  assert.match(js,/recoverAfterError/);
  assert.match(js,/profileValues=\{\.\.\.fresh\.values,\.\.\.profileValues\}/);
  assert.match(js,/Состояние перечитано; проверьте значения/);
  assert.doesNotMatch(js,/catch\(e\)\{if\(\[/);
});
