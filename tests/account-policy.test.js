"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const {ACCOUNT_OPERATIONS}=require("../dist/src/ports/accounts.js");
const {requireAccountPermission,FRESH_MFA_MS}=require("../dist/src/ports/account-policy.js");
const now=1800000000000;
const principal=role=>({realm:role==="researcher"?"researcher":"staff",userId:"internal",credentialId:"internal",role,sessionVersion:1,expiresAt:now+1800000,mfaVerifiedAt:role==="researcher"?null:now});
const matrix={researcher:["account.read","studies.read","studies.configure","aggregates.read"],
  administrator:["account.read","studies.read","aggregates.read","researchers.read","researchers.invite","researchers.block","protocols.read","protocols.download","results.read","results.download"],
  superadministrator:["account.read","studies.read","aggregates.read","researchers.read","researchers.invite","researchers.block","protocols.read","protocols.download","results.read","results.download","staff.roles.assign","methods.manage","processing.manage"]};
for(const [role,allowed] of Object.entries(matrix))test("Account policy: exact agreed permissions for "+role,()=>{
  for(const op of ACCOUNT_OPERATIONS){const fn=()=>requireAccountPermission(principal(role),op,{studyId:"owned"},now,true);
    if(allowed.includes(op))assert.doesNotThrow(fn);else assert.throws(fn,e=>e.status===403&&e.code==="FORBIDDEN");}
});
test("Account policy: researcher needs verified own membership, no individual data",()=>{
  for(const op of ["studies.read","studies.configure","aggregates.read"]){
    assert.throws(()=>requireAccountPermission(principal("researcher"),op,{studyId:"foreign"},now,false),e=>e.status===404);
    assert.throws(()=>requireAccountPermission(principal("researcher"),op,{},now,true),e=>e.status===404);}
  assert.doesNotThrow(()=>requireAccountPermission(principal("researcher"),"account.read",{},now,false));
});
test("Account policy: both staff roles are global, no participant writes",()=>{
  for(const role of ["administrator","superadministrator"]){assert.doesNotThrow(()=>requireAccountPermission(principal(role),"results.read",{},now,false));
    assert.throws(()=>requireAccountPermission(principal(role),"draft.save",{},now,true),e=>e.status===403);}
});
test("Account policy: expiry, missing MFA, mixed realms and invalid versions fail closed",()=>{
  for(const p of [{...principal("administrator"),mfaVerifiedAt:null},{...principal("administrator"),mfaVerifiedAt:now+1},
    {...principal("researcher"),expiresAt:now},{...principal("researcher"),sessionVersion:0},
    {...principal("researcher"),realm:"staff"},{...principal("administrator"),realm:"participant"}])
    assert.throws(()=>requireAccountPermission(p,"account.read",{},now,true),e=>e.status===401);
});
test("Account policy: sensitive operation requires fresh MFA, read does not",()=>{
  for(const role of ["administrator","superadministrator"]){const p={...principal(role),mfaVerifiedAt:now-FRESH_MFA_MS};
    for(const op of ["researchers.invite","researchers.block","protocols.download","results.download"])
      assert.throws(()=>requireAccountPermission(p,op,{},now,false),e=>e.code==="MFA_RECHECK_REQUIRED");
    assert.doesNotThrow(()=>requireAccountPermission(p,"results.read",{},now,false));}
});
