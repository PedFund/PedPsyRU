"use strict";
const {randomBytes}=require("node:crypto"),{PostgresResearcherManagement,PostgresResearcherGateway}=require("../dist/src/adapters/postgres/researchers.js");
const {PostgresStudyConstructor}=require("../dist/src/adapters/postgres/studies.js");
async function studyResearcher(f,staff){const management=new PostgresResearcherManagement(f.runtime),gateway=new PostgresResearcherGateway(f.runtime),invite=await management.invite(staff.session.token),password=randomBytes(24).toString("base64url");
  await gateway.accept({invite_code:invite.invite_code,password});const session=await gateway.login({login_id:invite.login_id,password});const row=(await management.list(staff.session.token)).find(x=>x.login_id===invite.login_id);
  return {management,gateway,invite,password,session,row,studies:new PostgresStudyConstructor(f.runtime)};}
module.exports={studyResearcher};
