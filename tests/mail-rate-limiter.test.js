"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict");
const {MailRateLimiter}=require("../dist/src/adapters/mail-rate-limiter.js");
test("mail rate limiter allows only the configured number in a sliding window",()=>{
  const limiter=new MailRateLimiter(2,60000);
  assert.equal(limiter.available(1000),2);
  assert.equal(limiter.take(1000),true);assert.equal(limiter.take(1000),true);
  assert.equal(limiter.available(1000),0);assert.equal(limiter.take(1000),false);
  assert.equal(limiter.available(60999),0);
  assert.equal(limiter.available(61000),2);
});
test("mail rate limiter rejects invalid configuration",()=>{
  for(const [limit,window] of [[0,60000],[1001,60000],[20,59999],[20,3600001]])assert.throws(()=>new MailRateLimiter(limit,window),/INVALID_MAIL_RATE/);
});
