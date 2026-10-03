"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict");
const {PostgresStaffPassword}=require("../dist/src/adapters/postgres/staff-password.js");
test("Staff password: strict login cannot accept roles, client identity or scope",async()=>{
  const s=new PostgresStaffPassword({connect(){throw new Error("must not reach database");}});
  for(const d of [null,[],{}, {login_id:"SYNTHETIC",password:"synthetic-password-only",role:"superadministrator"},{login_id:"lowercase",password:"short"}])
    await assert.rejects(s.password(d),e=>e.status===400);
});
