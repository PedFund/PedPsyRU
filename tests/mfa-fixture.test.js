"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict"),{previousFixtureCode}=require("./mfa-fixture.js"),{otpAt}=require("../dist/src/adapters/security/totp.js");
test("previous-code fixture waits only near boundary, reserves current step, never retries authentication",async()=>{
  const secret=Buffer.alloc(20,7);
  for(const remainder of [0,24999,25000,25001,29999]){let at=300000+remainder;const waits=[],initial=at;
    const code=await previousFixtureCode(secret,{now:()=>at,sleep:async ms=>{waits.push(ms);at+=ms;}});
    assert.equal(waits.length,remainder>25000?1:0);assert.ok(waits.every(x=>x>0&&x<=5100));
    assert.equal(code,otpAt(secret,Math.floor(at/30000)-1));assert.ok(30000-at%30000>=5000);
    assert.equal(Math.floor(at/30000)-Math.floor(initial/30000),waits.length);
  }
});
