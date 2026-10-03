"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict"),{randomBytes}=require("node:crypto");
const {otpAt,matchingStep,base32}=require("../dist/src/adapters/security/totp.js"),{MfaVault}=require("../dist/src/adapters/security/mfa-vault.js");
// Published RFC vectors are controls, never operational credentials.
const secret=Buffer.from("12345678901234567890");
test("MFA crypto: RFC4226 HOTP controls",()=>{const codes=["755224","287082","359152","969429","338314","254676","287922","162583","399871","520489"];
  for(let i=0;i<codes.length;i++)assert.equal(otpAt(secret,i),codes[i]);});
test("MFA crypto: RFC6238 SHA1 vectors incl post-2038 counter",()=>{
  for(const [seconds,code] of [[59,"94287082"],[1111111109,"07081804"],[1111111111,"14050471"],[1234567890,"89005924"],[2000000000,"69279037"],[20000000000,"65353130"]])assert.equal(otpAt(secret,Math.floor(seconds/30),8),code);
});
test("MFA crypto: bounded drift and canonical code, base32",()=>{
  const at=1800000000000,s=Math.floor(at/30000);for(const n of [-1,0,1])assert.equal(matchingStep(secret,otpAt(secret,s+n),at),s+n);
  assert.equal(matchingStep(secret,otpAt(secret,s-2),at),null);assert.equal(matchingStep(secret,"12345",at),null);
  assert.equal(base32(Buffer.from("foo")),"MZXW6");assert.equal(base32(secret),"GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
});
test("MFA crypto: AES256GCM random nonce, bound identity, tamper/wrong key fail",()=>{
  const key=randomBytes(32),v=new MfaVault(key),raw=randomBytes(20),a=v.seal("actor",raw),b=v.seal("actor",raw);
  assert.notEqual(a,b);assert.ok(!a.includes(raw.toString("hex")));assert.deepEqual(v.open("actor",a),raw);
  assert.throws(()=>v.open("other",a));assert.throws(()=>new MfaVault(randomBytes(32)).open("actor",a));
  assert.throws(()=>v.open("actor",a.slice(0,-1)+(a.endsWith("A")?"B":"A")));assert.throws(()=>new MfaVault(Buffer.alloc(32)));
});
