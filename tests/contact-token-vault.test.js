"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict"),{randomBytes,randomUUID}=require("node:crypto");
const {ContactTokenVault}=require("../dist/src/adapters/security/contact-token-vault.js"),{MfaVault}=require("../dist/src/adapters/security/mfa-vault.js");
test("contact vault explicit key, random nonce, purpose/row-bound authenticated envelope and redacted failures",()=>{
  for(const key of [Buffer.alloc(0),Buffer.alloc(32),Buffer.alloc(31,1)])assert.throws(()=>new ContactTokenVault(key),/EXPLICIT_CONTACT_KEY_REQUIRED/);
  const key=randomBytes(32),vault=new ContactTokenVault(key),id=randomUUID(),token=randomBytes(32).toString("base64url"),sealed=vault.seal(id,token),other=vault.seal(id,token);
  assert.ok(sealed!==other);assert.ok(!sealed.includes(token));assert.match(sealed,/^v1\.[\w-]{16}\.[\w-]{58}\.[\w-]{22}$/);assert.ok(vault.open(id,sealed)===token);
  assert.throws(()=>vault.open(randomUUID(),sealed));assert.throws(()=>new ContactTokenVault(randomBytes(32)).open(id,sealed));assert.throws(()=>new MfaVault(key).open(id,sealed));
  const p=sealed.split(".");p[2]=(p[2][0]==="A"?"B":"A")+p[2].slice(1);assert.throws(()=>vault.open(id,p.join(".")));
  for(const input of ["",sealed+"=","v1.a.b.c",sealed.replace(/^v1/,"v2")])assert.throws(()=>vault.open(id,input),/INVALID_CONTACT_ENVELOPE/);
  for(const input of ["",token+"=","x".repeat(42)])assert.throws(()=>vault.seal(id,input),/INVALID_CONFIRMATION_TOKEN/);
});
