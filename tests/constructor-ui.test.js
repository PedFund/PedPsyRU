"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
test("constructor UI IDs/escaping/uncertain-write guards are wired; actual DOM behavior requires PG browser acceptance",()=>{
  const html=fs.readFileSync(path.join(__dirname,"../web/workspace/index.html"),"utf8"),js=fs.readFileSync(path.join(__dirname,"../web/workspace/app.js"),"utf8"),ids=Array.from(html.matchAll(/\bid="([^"]+)"/g),m=>m[1]);
  assert.equal(new Set(ids).size,ids.length);for(const match of js.matchAll(/\$\("([^"]+)"\)/g))assert.ok(ids.includes(match[1]),"Missing element "+match[1]);
  for(const id of ["login-form","accept-form"]){const form=html.match(new RegExp('<form id="'+id+'"[^>]*>(.*?)</form>','s'))[0];assert.match(form,/method="post"/);assert.match(form,/<button[^>]*disabled/);}
  for(const id of ["create-study-form","group-form","stage-form","copy-stage-form","copy-assignments-form","group-cards","stage-cards","method-target-group","method-target-stage","save-method-selection","rename-study-form","study-hub","study-design-section","study-participants-section","study-methods-section","design-lock-note","activate-study","archive-study","staff-studies"])assert.ok(ids.includes(id));
  assert.ok(!/innerHTML|localStorage|sessionStorage|\beval\(/.test(js));assert.match(js,/expected_version:design\.version/);assert.match(js,/designLocked=true/);assert.match(js,/creationLocked=true/);assert.match(js,/textContent=d\.title/);assert.match(js,/if\(design\)await openDesign\(design\.id\)/);assert.match(html,/Полная методическая и эксплуатационная приёмка впереди/);assert.match(html,/Индивидуальные ответы и баллы исследователю не выдаются/);
  assert.match(js,/for\(const release of design\.catalog\)/,"server-allowed releases, not optional metadata, drive the catalogue");
  assert.match(js,/study-link/);assert.match(js,/design-method-list/);assert.doesNotMatch(js,/label:"Открыть",fn:\(\)=>openDesign/);
});
