"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict");
const {productionConfig}=require("../dist/src/bootstrap/production-config.js");
const mfa=Buffer.alloc(32,1).toString("base64"),contact=Buffer.alloc(32,2).toString("base64");
const valid={PEDPSY_ENV:"production",PEDPSY_PUBLIC_ORIGIN:"https://research.example.org",HOST:"127.0.0.1",PORT:"4174",
  PGHOST:"db.internal",PGPORT:"5432",PGDATABASE:"pedpsy_prod",PGUSER:"pedpsy_runtime_0123456789abcdef",PGPASSWORD:"synthetic-password",
  PGSSL:"verify-full",PEDPSY_MFA_KEY:mfa,PEDPSY_CONTACT_KEY:contact,PEDPSY_CONTACT_DEMO:"1"};
test("production config: validated HTTPS origin, runtime role, DB SSL and distinct keys",()=>{
  const c=productionConfig(valid);
  assert.equal(c.origin,"https://research.example.org");assert.equal(c.port,4174);assert.equal(c.host,"127.0.0.1");
  assert.equal(c.db.database,"pedpsy_prod");assert.equal(c.db.ssl.rejectUnauthorized,true);assert.equal(c.db.max,8);
  assert.equal(c.mfaKey,mfa);assert.equal(c.contactKey,contact);assert.notEqual(c.mfaKey,c.contactKey);
});
test("production config: HTTP, loopback origin, demo DB, wrong role, no SSL and bad keys fail closed",()=>{
  for(const patch of [
    {PEDPSY_ENV:"demo"},{PEDPSY_PUBLIC_ORIGIN:"http://research.example.org"},{PEDPSY_PUBLIC_ORIGIN:"https://127.0.0.1"},
    {PEDPSY_PUBLIC_ORIGIN:"https://research.example.org/path"},{PGDATABASE:"pedpsy_demo_0123456789abcdef"},
    {PGUSER:"pedpsy_owner"},{PGSSL:"false"},{PEDPSY_MFA_KEY:"short"},{PEDPSY_CONTACT_KEY:mfa},
    {PEDPSY_CONTACT_DEMO:"0"},{PGHOST:""}
  ]) assert.throws(()=>productionConfig({...valid,...patch}),e=>!String(e.message).includes(mfa));
});
test("production config: contact key is optional for a closed contour",()=>{
  const env={...valid};delete env.PEDPSY_CONTACT_KEY;delete env.PEDPSY_CONTACT_DEMO;
  const c=productionConfig(env);assert.equal("contactKey" in c,false);
});
