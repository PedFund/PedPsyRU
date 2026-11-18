"use strict";
// Migration 092: identity-level lockout after repeated failures. Ten failures in
// the 24-hour window block the identity for 15 minutes; a successful login
// resets the counter. Both wrong passwords and per-window throttle refusals count
// as failures, because both indicate an attempt.
const {test}=require("node:test"),assert=require("node:assert/strict");
const {postgresFixture}=require("./postgres-fixture.js"),{stageSetup}=require("./participant-enrollment-fixture.js");
const wrong="wrong synthetic password";
function login(x,password){return x.registration.login({study_id:x.design.id,email:x.email,password});}
async function blocked(f,x){return (await f.admin.query("SELECT pedpsy.login_lock_blocked('participant-email',$1) value",[x.email])).rows[0].value;}
async function clearLock(f,x){await f.admin.query("SELECT pedpsy.login_lock_success('participant-email',$1)",[x.email]);}
function setup(fn){return async t=>{const f=await postgresFixture({runtimePoolSize:3});t.after(()=>f.close());await fn(f,await stageSetup(f));};}
test("PostgreSQL login lock: ten failures lock the identity even for a correct password",setup(async(f,x)=>{
  // The fixture already performed one successful login, and the per-window
  // throttle counts every attempt, so a refusal may come as INVALID_LOGIN or as
  // LOGIN_THROTTLED; both must count towards the lock.
  const seen=new Set();
  for(let i=1;i<=10;i++){
    await assert.rejects(login(x,wrong),error=>{seen.add(error.code);return ["INVALID_LOGIN","LOGIN_THROTTLED"].includes(error.code);});
  }
  assert.ok(seen.has("INVALID_LOGIN"),"a wrong password is verified and refused with INVALID_LOGIN before the window closes");
  assert.equal(await blocked(f,x),true,"ten failures must create a lock counter");
  await assert.rejects(login(x,x.password),error=>error.status===429&&error.code==="LOGIN_LOCKED","a locked identity is refused before password verification");
  const audit=Number((await f.admin.query("SELECT count(*) n FROM pedpsy.access_audit_events WHERE action='participant_login' AND reason='ACCOUNT_LOCKED'")).rows[0].n);
  assert.ok(audit>=1,"the lock transition is audited");
}));
test("PostgreSQL login lock: a successful login resets the failure counter",setup(async(f,x)=>{
  await login(x,x.password);
  await clearLock(f,x);
  assert.equal(await blocked(f,x),false);
  for(let i=1;i<=9;i++)await assert.rejects(login(x,wrong));
  assert.equal(await blocked(f,x),false,"nine failures stay below the lock threshold");
  await assert.rejects(login(x,wrong));
  assert.equal(await blocked(f,x),true,"the tenth failure locks the identity");
}));
