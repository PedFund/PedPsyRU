"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
test("constructor UI IDs/escaping/uncertain-write guards are wired; actual DOM behavior requires PG browser acceptance",()=>{
  const html=fs.readFileSync(path.join(__dirname,"../web/workspace/index.html"),"utf8"),js=fs.readFileSync(path.join(__dirname,"../web/workspace/app.js"),"utf8"),ids=Array.from(html.matchAll(/\bid="([^"]+)"/g),m=>m[1]);
  assert.equal(new Set(ids).size,ids.length);for(const match of js.matchAll(/\$\("([^"]+)"\)/g))assert.ok(ids.includes(match[1]),"Missing element "+match[1]);
  for(const id of ["create-study-form","group-form","stage-form","copy-stage-form","assignment-form","rename-study-form","reload-design","design-lock-note","activate-study","archive-study","staff-studies"])assert.ok(ids.includes(id));
  assert.ok(!/innerHTML|localStorage|sessionStorage|\beval\(/.test(js));assert.match(js,/expected_version:design\.version/);assert.match(js,/designLocked=true/);assert.match(js,/creationLocked=true/);assert.match(js,/textContent=d\.title/);assert.match(js,/if\(design\)await openDesign\(design\.id\)/);assert.match(html,/полное методическое утверждение ещё не завершено/);assert.match(html,/Индивидуальные ответы и баллы исследователю не выдаются/);
});
