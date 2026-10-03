"use strict";
const {randomUUID,randomBytes}=require("node:crypto");
const {passwordRecord}=require("../storage/access.js");
async function staffFixture(f,role="superadministrator"){
  const user=randomUUID(),id=randomUUID(),login="SYNTHETIC-"+randomBytes(5).toString("hex").toUpperCase(),password=randomBytes(24).toString("base64url");
  const p=await passwordRecord(password);
  await f.admin.query("INSERT INTO pedpsy.users(id) VALUES($1)",[user]);
  await f.admin.query("INSERT INTO pedpsy.staff_credentials(id,user_id,login_id,role,scheme,salt,password_hash) VALUES($1,$2,$3,$4,$5,$6,$7)",[id,user,login,role,p.scheme,p.salt,p.password_hash]);
  return {user,id,login,password};
}
module.exports={staffFixture};
