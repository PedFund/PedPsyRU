"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict"),{randomBytes}=require("node:crypto");
const {SignedRegistrationBrowser}=require("../dist/src/adapters/security/registration-browser.js"),{ContactTokenVault}=require("../dist/src/adapters/security/contact-token-vault.js");
const {contactDemoKey}=require("../dist/src/bootstrap/registration-config.js"),{csrfFor}=require("../storage/access.js");
const origin="http://127.0.0.1:4174",rejected=e=>e.status===403&&e.code==="CSRF_REJECTED";
test("registration browser: purpose/origin/key-bound signed nonce, retained key restart and unchanged outbox crypto",()=>{
  const key=randomBytes(32),saved=Buffer.from(key),a=new SignedRegistrationBrowser(key,origin),b=new SignedRegistrationBrowser(saved,origin),vault=new ContactTokenVault(key),nonce=a.create(),other=a.create();key.fill(0);
  assert.ok(nonce!==other,"nonce reused");assert.match(nonce,/^[A-Za-z0-9_-]{43}$/);assert.ok(a.valid(nonce)&&b.valid(nonce));assert.ok(!new SignedRegistrationBrowser(randomBytes(32),origin).valid(nonce));assert.ok(!new SignedRegistrationBrowser(saved,"https://example.test").valid(nonce));
  const delivery="12345678-1234-1234-1234-123456789012",proof=randomBytes(32).toString("base64url"),envelope=vault.seal(delivery,proof);assert.ok(new ContactTokenVault(saved).open(delivery,envelope)===proof,"retained outbox key changed");saved.fill(0);
});
test("registration browser: exact server time boundary, future/expired clock and unsupported issue clock fail closed",()=>{
  let now=1700000000123;const a=new SignedRegistrationBrowser(randomBytes(32),origin,()=>now),nonce=a.create(),expires=a.expiresAt(nonce);assert.equal(expires,1700003600000);
  now=1700000000000-1;assert.ok(!a.valid(nonce));now=expires-1;assert.ok(a.valid(nonce));now=expires;assert.ok(!a.valid(nonce));assert.throws(()=>a.csrf(nonce),rejected);
  for(const at of [NaN,-1000,4294967296000])assert.throws(()=>new SignedRegistrationBrowser(randomBytes(32),origin,()=>at).create(),/INVALID_REGISTRATION_CLOCK/);
});
test("registration browser: tampered/canonical malformed/renamed staff nonce does not become a preauth cookie",()=>{
  const a=new SignedRegistrationBrowser(randomBytes(32),origin),nonce=a.create(),bytes=Buffer.from(nonce,"base64url");bytes[6]^=1;assert.ok(!a.valid(bytes.toString("base64url")));
  const alphabet="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_",last=alphabet.indexOf(nonce.at(-1)),alias=nonce.slice(0,-1)+alphabet[last|1];assert.ok(!a.valid(alias));
  for(const invalid of [null,{},[],"",nonce+"=",nonce.slice(1),"s".repeat(43),randomBytes(32).toString("base64url")])assert.ok(!a.valid(invalid));
});
test("registration browser: independent CSRF cannot reuse old staff/session CSRF or another nonce",()=>{
  const a=new SignedRegistrationBrowser(randomBytes(32),origin),nonce=a.create(),other=a.create();a.assert(nonce,a.csrf(nonce));
  for(const wrong of [csrfFor(nonce),a.csrf(other),"x",null,"x".repeat(44)])assert.throws(()=>a.assert(nonce,wrong),rejected);
  assert.throws(()=>a.assert("s".repeat(43),csrfFor("s".repeat(43))),rejected);
});
test("registration browser: empty/short key and unsafe origins rejected",()=>{
  for(const key of [Buffer.alloc(32),Buffer.alloc(31),Buffer.alloc(33)])assert.throws(()=>new SignedRegistrationBrowser(key,origin),/EXPLICIT_CONTACT_KEY_REQUIRED/);
  for(const o of ["http://example.test","ftp://example.test",origin+"/","https://example.test/path"])assert.throws(()=>new SignedRegistrationBrowser(randomBytes(32),o),/EXPLICIT_SAFE_ORIGIN_REQUIRED/);
});
test("contact configuration: explicit separate nonzero canonical master only; no fallback/generation or env rewrite",()=>{
  const mfa=randomBytes(32).toString("base64"),contact=randomBytes(32).toString("base64"),good={PEDPSY_CONTACT_DEMO:"1",PEDPSY_CONTACT_KEY:contact,PEDPSY_MFA_KEY:mfa},before=JSON.stringify(good),key=contactDemoKey(good);
  assert.ok(key?.equals(Buffer.from(contact,"base64")),"configured key changed");key.fill(0);assert.ok(JSON.stringify(good)===before,"environment rewritten");
  for(const env of [{},{...good,PEDPSY_CONTACT_DEMO:undefined},{...good,PEDPSY_CONTACT_DEMO:"yes"},{...good,PEDPSY_CONTACT_KEY:undefined},
    {...good,PEDPSY_CONTACT_KEY:mfa},{...good,PEDPSY_CONTACT_KEY:Buffer.alloc(32).toString("base64")},{...good,PEDPSY_CONTACT_KEY:contact+"="},{...good,PEDPSY_MFA_KEY:undefined},{...good,PEDPSY_MFA_KEY:"malformed"}])assert.equal(contactDemoKey(env),null);
});
