"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict");
const {PostgresAccountAccess}=require("../dist/src/adapters/postgres/account-access.js");
function fixture({now,verified=now,expires=now+1800000}){
  const audits=[];const client={release(){},async query(sql,args){
    if(sql.includes("SELECT rolsuper"))return {rows:[{unsafe:false}]};
    if(sql==="SELECT * FROM pedpsy.account_actor()")return {rows:[{credential_id:"synthetic",user_id:"synthetic",actor_role:"administrator",credential_version:1,expires_at_ms:String(expires),mfa_verified_at_ms:String(verified)}]};
    if(sql.includes("now_ms"))return {rows:[{now_ms:String(now)}]};
    if(sql.includes("record_account_check"))audits.push(args);
    return {rows:[]};
  }};return {api:new PostgresAccountAccess({connect:async()=>client}),audits};
}
test("account authorization uses persisted MFA database clock even when Node clock lags",async()=>{
  const now=Date.now()+60000,x=fixture({now});const s=await x.api.session("A".repeat(43));assert.equal(s.role,"administrator");assert.equal(x.audits[0][1],true);
});
test("database clock preserves exact expiry and fresh MFA boundary, without tolerance",async()=>{
  const now=Date.now()+60000;
  await assert.rejects(fixture({now,expires:now}).api.session("A".repeat(43)),e=>e.code==="AUTH_REQUIRED");
  await assert.rejects(fixture({now,verified:now+1}).api.session("A".repeat(43)),e=>e.code==="AUTH_REQUIRED");
  await assert.rejects(fixture({now,verified:now-300000}).api.check("A".repeat(43),"researchers.invite"),e=>e.code==="MFA_RECHECK_REQUIRED");
});
