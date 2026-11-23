"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const root=path.resolve(__dirname,"..");
const html=fs.readFileSync(path.join(root,"web/workspace/index.html"),"utf8");
const js=fs.readFileSync(path.join(root,"web/workspace/app.js"),"utf8");
const css=fs.readFileSync(path.join(root,"web/workspace/styles.css"),"utf8");

test("researcher navigation has one overview tab per lifecycle state, plan and participants",()=>{
  assert.match(html,/id="study-tab-launch"[^>]*data-study-section-open="launch"[^>]*>[\s\S]*?<span>Обзор<\/span><\/button>/);
  assert.match(html,/id="study-tab-progress"[^>]*data-study-section-open="progress"[^>]*>[\s\S]*?<span>Обзор<\/span><\/button>/);
  assert.match(html,/data-study-section-open="design">[\s\S]*?<span>План исследования<\/span><\/button>/);
  assert.match(html,/data-study-section-open="participants">[\s\S]*?<span>Участники<\/span><\/button>/);
  assert.match(js,/show\("study-tab-launch",draft\)/);
  assert.match(js,/show\("study-tab-progress",!draft\)/);
  for(const id of ["study-hub","study-progress-section","study-design-section","study-participants-section","study-methods-section","back-study-hub"]){
    assert.match(html,new RegExp('id="'+id+'"'));
  }
});

test("researcher controls remain wired while moving refresh, login and exit into compact account menu",()=>{
  assert.match(html,/<details id="account-actions"/);
  for(const id of ["refresh","reauth","logout","researcher-login-line","researcher-login-value","copy-researcher-login"]){
    assert.match(html,new RegExp('id="'+id+'"'));
  }
  assert.match(js,/document\.body\.classList\.add\("study-open"\)/);
  assert.match(js,/document\.body\.classList\.remove\("study-open"\)/);
});

test("study status filter uses actual server-supported statuses, not an invented archive status",()=>{
  for(const value of ["all","draft","active","closed"]){
    assert.match(html,new RegExp('<option value="'+value+'">'));
  }
  assert.doesNotMatch(html,/<option value="archived"/);
  assert.match(js,/filter==="all"\?studies:studies\.filter\(s=>s\.status===filter\)/);
  assert.match(js,/studyRows\("studies",session\.home\.studies\)/);
});

test("color hierarchy retains existing teal accents and distinct semantic text roles",()=>{
  for(const token of ["--ui-text-heading","--ui-text-main","--ui-text-secondary","--ui-text-meta","--ui-text-action"]){
    assert.ok(css.includes(token),token);
  }
  assert.match(css,/\.study-status-active\{color:/);
  assert.match(css,/\.study-status-draft\{color:/);
  assert.match(css,/#study-tabs button\.active\{background:#167a83;color:#fff\}/);
  assert.match(css,/@media\(max-width:640px\)/);
});

test("vector icons inherit semantic UI text color without external dependencies",()=>{
  assert.match(html,/<nav id="study-tabs"[\\s\\S]*?<svg viewBox="0 0 24 24"/);
  assert.match(css,/#study-tabs button svg\{stroke:currentColor\}/);
  assert.match(css,/#study-tabs button\.active\{background:#167a83;color:#fff/);
  assert.match(css,/#researcher-home \.study-list-item:has\(\.study-status-active\)/);
  assert.doesNotMatch(html,/<img[^>]+src="https?:/);
});
