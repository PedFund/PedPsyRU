"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict");
const {participantAdmissionPolicy}=require("../dist/src/bootstrap/login-policy.js");
const {DEFAULT_PARTICIPANT_ADMISSION}=require("../dist/src/ports/login-policy.js");
test("default participant admission keeps the historical production limit",()=>{
  assert.deepEqual(participantAdmissionPolicy({}),{
    globalLimit:30,globalWindowMs:300000,derivationConcurrency:1,queueLimit:0,queueTimeoutMs:0
  });
  assert.deepEqual(participantAdmissionPolicy({}),DEFAULT_PARTICIPANT_ADMISSION);
});
test("explicit pilot profile raises the global limit within a bounded range",()=>{
  assert.deepEqual(participantAdmissionPolicy({PEDPSY_PILOT_LOGIN:"1"}),{
    globalLimit:900,globalWindowMs:300000,derivationConcurrency:2,queueLimit:512,queueTimeoutMs:30000
  });
  assert.equal(participantAdmissionPolicy({PEDPSY_PILOT_LOGIN:"1",PEDPSY_PILOT_LOGIN_LIMIT:"300"}).globalLimit,300);
  assert.equal(participantAdmissionPolicy({PEDPSY_PILOT_LOGIN:"1",PEDPSY_PILOT_LOGIN_CONCURRENCY:"4"}).derivationConcurrency,4);
});
test("invalid or implicit pilot configuration fails closed",()=>{
  for(const env of [
    {PEDPSY_PILOT_LOGIN:"0"},{PEDPSY_PILOT_LOGIN:"true"},{PEDPSY_PILOT_LOGIN:""},
    {PEDPSY_PILOT_LOGIN_LIMIT:"300"},{PEDPSY_PILOT_LOGIN_CONCURRENCY:"2"},
    {PEDPSY_PILOT_LOGIN:"1",PEDPSY_PILOT_LOGIN_LIMIT:"30"},
    {PEDPSY_PILOT_LOGIN:"1",PEDPSY_PILOT_LOGIN_LIMIT:"1201"},
    {PEDPSY_PILOT_LOGIN:"1",PEDPSY_PILOT_LOGIN_LIMIT:"900.5"},
    {PEDPSY_PILOT_LOGIN:"1",PEDPSY_PILOT_LOGIN_CONCURRENCY:"0"},
    {PEDPSY_PILOT_LOGIN:"1",PEDPSY_PILOT_LOGIN_CONCURRENCY:"5"}
  ]) assert.throws(()=>participantAdmissionPolicy(env),/PILOT_LOGIN_CONFIG_INVALID/);
});
