"use strict";
const {randomBytes}=require("node:crypto"),{staffFixture}=require("./staff-fixture.js");
const {PostgresStaffMfa}=require("../dist/src/adapters/postgres/staff-mfa.js"),{MfaVault}=require("../dist/src/adapters/security/mfa-vault.js"),{otpAt}=require("../dist/src/adapters/security/totp.js");
async function verifiedStaff(f,role="superadministrator"){
  const s=await staffFixture(f,role),vault=new MfaVault(randomBytes(32)),gateway=new PostgresStaffMfa(f.runtime,vault),pending=await gateway.password({login_id:s.login,password:s.password});
  await gateway.enroll(pending.challenge);const factor=(await f.admin.query("SELECT secret_envelope FROM pedpsy.staff_mfa_factors WHERE credential_id=$1",[s.id])).rows[0];
  const secret=vault.open(s.id,factor.secret_envelope);try{
    const session=await gateway.verify(pending.challenge,{type:"totp",code:otpAt(secret,Math.floor(Date.now()/30000)-1)});return {...s,gateway,vault,session};
  }finally{secret.fill(0);}
}
module.exports={verifiedStaff};
