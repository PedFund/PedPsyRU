"use strict";
const path=require("node:path");
const {randomBytes}=require("node:crypto");
const {openDatabase,migrate}=require("./database.js");
const {createAdminAccess}=require("./admin-access.js");
const {POLICY}=require("./roles.js");
(async()=>{
  const [command,first,second]=process.argv.slice(2);
  const login_id=command==="issue"?second:first;
  if(!["issue","reset","revoke"].includes(command) || !/^[A-Z0-9-]{3,80}$/.test(login_id||"")
    || (command==="issue"?(!Object.hasOwn(POLICY,first)||process.argv.length!==5):process.argv.length!==4)) {
    console.error("Usage: staff-cli.js issue administrator|superadministrator LOGIN | reset|revoke LOGIN");process.exitCode=1;return;
  }
  if(!process.stdout.isTTY){console.error("Use an interactive terminal; credential output is not allowed in logs.");process.exitCode=1;return;}
  let db;
  try {
    const filename=path.join(__dirname,"..",".local","training.sqlite");
    if(!require("node:fs").existsSync(filename))throw new Error("Run db:seed first");
    db=openDatabase(filename);migrate(db);const service=createAdminAccess(db);
    if(command==="revoke"){service.revoke(login_id);console.log("Staff access revoked:",login_id);return;}
    const password=randomBytes(24).toString("base64url");
    if(command==="issue")await service.provision({role:first,login_id,password});else await service.resetPassword(login_id,password);
    console.log("Local synthetic platform only. Store privately; displayed once.");
    console.log("Login:",login_id);console.log("Password:",password);console.log("Sign-in: http://127.0.0.1:4173/admin");
  }catch(error){console.error("Staff operation failed:",error.code||error.message);process.exitCode=1;}
  finally{if(db?.isOpen)db.close();}
})();
