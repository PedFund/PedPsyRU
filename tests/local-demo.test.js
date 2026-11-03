"use strict";
const {test} = require("node:test"), assert = require("node:assert/strict");
const {validateConfig, runtimeEnvironment, bootstrapFirst} = require("../scripts/local-demo.js");
const suffix = "abcdef0123456789";
const config = {host: "127.0.0.1", port: 55432, database: "pedpsy_demo_" + suffix,
  user: "pedpsy_runtime_" + suffix, password: "a".repeat(64), mfaKey: Buffer.alloc(32, 1).toString("base64")};
test("local demo refuses remote, CI, generic DB, privileged role and mismatched config", () => {
  assert.equal(validateConfig(config, "runtime"), config);
  assert.throws(() => validateConfig(config, "control"), /INVALID_LOCAL_CONFIG/);
  for (const change of [{host: "0.0.0.0"}, {host: "localhost"}, {port: 5432}, {database: "postgres"},
    {database: "pedpsy_ci_" + suffix}, {user: "postgres"}, {user: "pedpsy_runtime_0123456789abcdef"}, {password: ""}, {mfaKey: ""},
    {mfaKey: config.mfaKey.slice(0, -2) + 'F='}])
    assert.throws(() => validateConfig({...config, ...change}, "runtime"), /INVALID_LOCAL_CONFIG/);
});
test("local runtime environment excludes owner/control credentials and test mode", () => {
  const e = runtimeEnvironment(config, {PATH: "synthetic-path", PGPASSWORD: "synthetic-owner-secret", PGUSER: "postgres",
    PGTEST_HOST: "0.0.0.0", PEDPSY_PG_TEST: "1", PEDPSY_MFA_KEY: "wrong"});
  assert.equal(e.PATH, "synthetic-path"); assert.equal(e.PGUSER, config.user); assert.equal(e.PGPASSWORD, config.password);
  assert.equal(e.PEDPSY_PG_DEMO, "1"); assert.equal(e.PEDPSY_MFA_KEY, config.mfaKey);
  assert.equal(e.PEDPSY_PG_TEST, undefined); assert.equal(e.PGTEST_HOST, undefined);
});
test("offline owner bootstrap has fixed login, validates password, no SQL before validation", async () => {
  let queries = 0; const client = {query: async () => {queries++;}};
  await assert.rejects(bootstrapFirst(client, "OTHER", "synthetic-valid-password"), /INVALID_OWNER_LOGIN/);
  await assert.rejects(bootstrapFirst(client, "PEDPSY-OWNER", "short"), /INVALID_PASSWORD/);
  assert.equal(queries, 0);
});
test("local contact demo needs explicit private opt-in and a distinct retained key; inherited flags cannot activate it",()=>{
  const key=Buffer.alloc(32,2).toString("base64"), inherited={PEDPSY_CONTACT_DEMO:"1",PEDPSY_CONTACT_KEY:key};
  assert.equal(runtimeEnvironment(config,inherited).PEDPSY_CONTACT_DEMO,undefined);
  assert.equal(runtimeEnvironment({...config,contactDemo:false,contactKey:key},inherited).PEDPSY_CONTACT_KEY,undefined);
  const c={...config,contactDemo:true,contactKey:key},e=runtimeEnvironment(c,inherited);
  assert.equal(e.PEDPSY_CONTACT_DEMO,"1");assert.equal(e.PEDPSY_CONTACT_KEY,key);assert.equal(e.PEDPSY_MFA_KEY,config.mfaKey);
  for(const change of [{contactDemo:"true"},{contactKey:undefined},{contactKey:"bad"},{contactKey:config.mfaKey},{contactKey:Buffer.alloc(32).toString("base64")},{contactKey:Buffer.alloc(31,2).toString("base64")}])
    assert.throws(()=>runtimeEnvironment({...c,...change}),/INVALID_LOCAL_CONTACT_CONFIG/);
  assert.equal(config.contactDemo,undefined);assert.equal(config.contactKey,undefined);
});
