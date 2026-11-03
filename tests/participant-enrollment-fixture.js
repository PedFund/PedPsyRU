"use strict";
const {randomBytes,randomUUID}=require("node:crypto"),{verifiedStaff}=require("./mfa-fixture.js"),{studyResearcher}=require("./study-fixture.js"),{responsesDigest}=require("../storage/releases.js");
const {PostgresParticipantRegistration}=require("../dist/src/adapters/postgres/participant-registration.js"),{ContactTokenVault}=require("../dist/src/adapters/security/contact-token-vault.js");
const {PostgresGroupInvitations}=require("../dist/src/adapters/postgres/group-invitations.js"),{PostgresStageAccess}=require("../dist/src/adapters/postgres/stage-access.js");
const {PostgresParticipantEnrollment}=require("../dist/src/adapters/postgres/participant-enrollment.js"),{PostgresParticipantPassports}=require("../dist/src/adapters/postgres/participant-passports.js"),{PostgresParticipantConsents}=require("../dist/src/adapters/postgres/participant-consents.js");
const {PostgresUnitOfWork}=require("../dist/src/adapters/postgres/unit-of-work.js"),{PostgresParticipantGateway}=require("../dist/src/adapters/postgres/identity.js"),{createParticipationService}=require("../dist/src/application/participation.js"),{tokenHash}=require("../dist/src/adapters/postgres/account-transaction.js");
async function stageIdentity(f,x,email="admission.participant@example.test"){
 const browser=randomBytes(32).toString("base64url"),password="synthetic admitted participant password";
 const landing=await x.registration.landing(x.invite.invite_token);
 await x.registration.start(x.invite.invite_token,{email,password,contact_notice_version:landing.contact_notice.version,accept_contact_notice:true},browser);
 const out=(await f.admin.query("SELECT o.id,o.token_envelope FROM pedpsy.contact_confirmation_outbox o JOIN pedpsy.registration_pending p ON p.id=o.pending_id WHERE p.study_id=$1 AND p.browser_hash=$2 AND p.status='pending'",[x.design.id,tokenHash(browser)])).rows[0];
 await x.registration.confirm(x.invite.invite_token,{confirmation_token:x.vault.open(out.id,out.token_envelope)},browser);
 const session=await x.registration.login({study_id:x.design.id,email,password}),identity=(await f.admin.query("SELECT c.id credential_id,c.participant_id FROM pedpsy.participant_contacts p JOIN pedpsy.participant_credentials c ON (c.study_id,c.participant_id)=(p.study_id,p.participant_id) WHERE p.study_id=$1 AND p.email_key=$2",[x.design.id,email])).rows[0];return {email,password,session,identity};
}
async function stageSetup(f){
 const staff=await verifiedStaff(f),r=await studyResearcher(f,staff);let design=await r.studies.create(r.session.token,"Synthetic atomic admission");
 design=await r.studies.group(r.session.token,design.id,undefined,{name:"КГ",kind:"control",expected_version:design.version});
 design=await r.studies.copy(r.session.token,design.id,{source_stage_id:design.stages[0].id,code:"T1",ordinal:1,expected_version:design.version});
 for(const g of design.groups)for(const s of design.stages)design=await r.studies.assign(r.session.token,design.id,{group_id:g.id,stage_id:s.id,release_ids:[f.seed.release_id],expected_version:design.version});
 design=await r.studies.lifecycle(r.session.token,design.id,{status:"active",expected_version:design.version});
 const invitations=new PostgresGroupInvitations(f.runtime),invite=await invitations.create(r.session.token,design.id,design.groups[0].id,{expires_at:Date.now()+86400000}),vault=new ContactTokenVault(randomBytes(32)),registration=new PostgresParticipantRegistration(f.runtime,vault),uow=new PostgresUnitOfWork(f.runtime);
 const base={staff,r,design,invitations,invite,vault,registration,uow,gateway:new PostgresParticipantGateway(f.runtime,uow),service:createParticipationService(uow,{newId:randomUUID,now:()=>new Date().toISOString(),digest:(ids,values)=>responsesDigest(ids.map(item_id=>({item_id})),values)}),enrollment:new PostgresParticipantEnrollment(f.runtime),access:new PostgresStageAccess(f.runtime),passports:new PostgresParticipantPassports(f.runtime),consents:new PostgresParticipantConsents(f.runtime)};
 return {...base,...await stageIdentity(f,base)};
}
const selection=(x,stage=0)=>({stage_id:x.design.stages[stage].id,expected_opening_revision:1,expected_passport_schema_version:1,expected_consent_policy_revision:0});
async function prepare(x,stage=0){const p=await x.passports.read(x.session.token),s=await x.passports.save(x.session.token,{schema_version:p.schema_version,expected_revision:p.revision,values:{sex:"female",age:30}});await x.passports.complete(x.session.token,{schema_version:s.schema_version,expected_revision:s.revision});const policy=await x.consents.read(x.session.token),participation=policy.documents.find(d=>d.purpose==="study_participation");await x.consents.accept(x.session.token,{purpose:"study_participation",document_version:participation.version,expected_policy_revision:policy.policy_revision,accept:true});await x.access.open(x.r.session.token,x.design.id,x.design.groups[0].id,x.design.stages[stage].id,{expected_revision:0});}
module.exports={stageSetup,stageIdentity,selection,prepare};
