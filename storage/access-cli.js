"use strict";

const path=require("node:path");
const {randomBytes}=require("node:crypto");
const {openDatabase,migrate}=require("./database.js");
const {createParticipantAccess}=require("./access.js");

(async () => {
  const [command,studyNumber,code]=process.argv.slice(2);
  if (!['issue','reset','revoke'].includes(command) || !/^[12]$/.test(studyNumber||'') || !/^DEMO-00[123]$/.test(code||'') || process.argv.length!==5) {
    console.error("Usage: node storage/access-cli.js issue|reset|revoke 1|2 DEMO-001|DEMO-002|DEMO-003");
    process.exitCode=1;return;
  }
  // Passwords printed once only in the user's interactive terminal, never tool/log/file output.
  if (!process.stdout.isTTY) {console.error("Use an interactive terminal; credential output is not allowed in logs.");process.exitCode=1;return;}
  let db;
  try {
    const filename=path.join(__dirname,"..",".local","training.sqlite");
    if (!require("node:fs").existsSync(filename)) throw new Error("Run db:seed first");
    db=openDatabase(filename);migrate(db);
    const seed=db.prepare("SELECT manifest FROM seed_runs WHERE name='synthetic-training-v1'").get();
    if(!seed)throw new Error("Synthetic seed required");
    const study=JSON.parse(seed.manifest).studies[Number(studyNumber)-1];
    const participant=study.participants.find(p=>p.display_code===code);
    const login_id="S"+studyNumber+"-"+code;
    const service=createParticipantAccess(db);
    if(command==='revoke'){service.revoke(login_id);console.log("Access revoked:",login_id);return;}
    const password=randomBytes(24).toString("base64url");
    if(command==='issue')await service.provision({study_id:study.id,participant_id:participant.id,login_id,password});
    else await service.resetPassword(login_id,password);
    console.log("Synthetic access only. Store privately; displayed once.");
    console.log("Login:",login_id);console.log("Password:",password);
    console.log("Local sign-in: http://127.0.0.1:4173/access");
  } catch(error){console.error("Access operation failed:",error.code||error.message);process.exitCode=1;}
  finally{if(db?.isOpen)db.close();}
})();
