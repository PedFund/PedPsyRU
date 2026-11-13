"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict");
const {mailDeliveryConfig}=require("../dist/src/bootstrap/mail-config.js");
const base={PEDPSY_MAIL_ENABLED:"1",PEDPSY_PILOT_REAL_EMAIL:"1",PEDPSY_SMTP_USER:"smtp-user",PEDPSY_SMTP_PASSWORD:"smtp-password",PEDPSY_MAIL_FROM:"Noreply@Example.org"};
test("mail delivery stays disabled unless explicitly enabled",()=>{
  assert.equal(mailDeliveryConfig({}),null);
  assert.throws(()=>mailDeliveryConfig({PEDPSY_SMTP_HOST:"smtp.mail.selcloud.ru"}),/MAIL_CONFIG_INVALID/);
  assert.throws(()=>mailDeliveryConfig({...base,PEDPSY_MAIL_ENABLED:"0"}),/MAIL_CONFIG_INVALID/);
});
test("Selectel SMTP defaults are bounded and never require a new dependency",()=>{
  const config=mailDeliveryConfig(base);
  assert.deepEqual(config.smtp,{host:"smtp.mail.selcloud.ru",port:1127,tls:"implicit",user:"smtp-user",password:"smtp-password",from:"Noreply@example.org",timeoutMs:15000});
  assert.equal(config.batch,10);assert.equal(config.pollMs,2000);assert.equal(config.allowlist,null);
  assert.equal(mailDeliveryConfig({...base,PEDPSY_SMTP_PORT:"465"}).smtp.port,465);
  assert.throws(()=>mailDeliveryConfig({...base,PEDPSY_SMTP_PORT:"1126"}),/MAIL_CONFIG_INVALID/);
  assert.equal(mailDeliveryConfig({...base,PEDPSY_MAIL_FROM_NAME:"МетодТест"}).smtp.fromName,"МетодТест");
});
test("allowlist and polling overrides are normalized and bounded",()=>{
  const config=mailDeliveryConfig({...base,PEDPSY_MAIL_ALLOWLIST:"First@Example.org, second@example.org",PEDPSY_MAIL_BATCH:"5",PEDPSY_MAIL_POLL_MS:"1000"});
  assert.deepEqual([...config.allowlist].sort(),["First@example.org","second@example.org"]);
  assert.equal(config.batch,5);assert.equal(config.pollMs,1000);
  for(const value of ["", "not-an-address", "a@example.org,,", "a@example.org, bad"]){
    assert.throws(()=>mailDeliveryConfig({...base,PEDPSY_MAIL_ALLOWLIST:value}),/MAIL_CONFIG_INVALID/);
  }
});
test("real sending requires explicit real-email mode",()=>{
  const {PEDPSY_PILOT_REAL_EMAIL:_ignored,...withoutReal}=base;
  assert.throws(()=>mailDeliveryConfig(withoutReal),/MAIL_REAL_EMAIL_REQUIRED/);
});
test("missing or invalid SMTP values fail closed",()=>{
  for(const override of [
    {PEDPSY_SMTP_USER:""},{PEDPSY_SMTP_PASSWORD:""},{PEDPSY_MAIL_FROM:"bad"},
    {PEDPSY_SMTP_PORT:"0"},{PEDPSY_SMTP_PORT:"70000"},{PEDPSY_MAIL_BATCH:"0"},
    {PEDPSY_MAIL_POLL_MS:"100"},{PEDPSY_SMTP_HOST:"bad host"},{PEDPSY_MAIL_FROM_NAME:"bad\nname"}
  ]) assert.throws(()=>mailDeliveryConfig({...base,...override}),/MAIL_CONFIG_INVALID/);
});
