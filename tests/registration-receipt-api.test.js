"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict");
const {createRegistrationReceiptApi}=require("../dist/src/application/registration-receipt-api.js");
const {PostgresRegistrationReceipt}=require("../dist/src/adapters/postgres/registration-receipt.js");
const id="12345678-1234-1234-1234-123456789012",invite="i".repeat(43),browser="b".repeat(43),code="c".repeat(43);
test("registration receipt API: explicit synthetic opt-in and protected empty request, no client authority",async()=>{
  for(const flag of [false,undefined,"true",1])assert.throws(()=>new PostgresRegistrationReceipt({}, {},flag),/EXPLICIT_SYNTHETIC_RECEIPT_REQUIRED/);
  let calls=0;const api=createRegistrationReceiptApi({receipt:async()=>{calls++;return {synthetic:true,confirmation_token:code,expires_at:1234};}},
    {assert:(token,csrf)=>{if(token!==browser||csrf!=="csrf")throw Error("csrf");}});
  assert.throws(()=>api.receipt(invite,browser,{},"wrong"),/csrf/);
  for(const input of [null,[],1,"",{email:"other@example.test"},{delivery_id:id},{role:"superadministrator"},{study_id:id},{confirmation_token:code}])
    assert.throws(()=>api.receipt(invite,browser,input,"csrf"),e=>e.code==="INVALID_REGISTRATION_INPUT");
  assert.throws(()=>api.receipt("invalid",browser,{},"csrf"),e=>e.status===404);assert.equal(calls,0);
  assert.deepEqual(await api.receipt(invite,browser,{},"csrf"),{synthetic:true,confirmation_token:code,expires_at:1234});assert.equal(calls,1);
});
test("registration receipt API: whitelist context and test receipt excludes contacts/password/diagnostic metadata",async()=>{
  const api=createRegistrationReceiptApi({context:async()=>({study_id:id,study_title:"Synthetic",group_name:"КГ",contact_notice:{version:"demo-1",text:"Synthetic only",legal_status:"synthetic_only",private:"not-public"},email:"not-public",participant_id:id}),
    receipt:async()=>({synthetic:true,confirmation_token:code,expires_at:1234,recipient:"not-public",password_hash:"not-public",scores:[12],session_token:"not-public"})},{assert:()=>{}});
  assert.deepEqual(await api.context(invite),{study_id:id,study_title:"Synthetic",group_name:"КГ",contact_notice:{version:"demo-1",text:"Synthetic only",legal_status:"synthetic_only"}});
  assert.deepEqual(await api.receipt(invite,browser,{},"csrf"),{synthetic:true,confirmation_token:code,expires_at:1234});
});
test("registration receipt API: wrong synthetic proof shape/expiry rejected rather than labelled valid",async()=>{
  for(const dto of [{synthetic:false,confirmation_token:code,expires_at:1234},{synthetic:true,confirmation_token:code,expires_at:"1234"},
    {synthetic:true,confirmation_token:code,expires_at:-1},{synthetic:true,confirmation_token:code,expires_at:Number.MAX_SAFE_INTEGER+1},
    {synthetic:true,confirmation_token:"invalid",expires_at:1234}]){
    const api=createRegistrationReceiptApi({receipt:async()=>dto},{assert:()=>{}});await assert.rejects(api.receipt(invite,browser,{},"csrf"),e=>[404,500].includes(e.status));
  }
});
