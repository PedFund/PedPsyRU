"use strict";
const {randomBytes}=require('node:crypto'),{postgresFixture}=require('./postgres-fixture.js'),{verifiedStaff}=require('./mfa-fixture.js'),{studyResearcher}=require('./study-fixture.js');
const {PostgresResearchWorkbench,PostgresParticipantProfiles}=require('../dist/src/adapters/postgres/research-workbench.js');
const {PostgresParticipantRegistration}=require('../dist/src/adapters/postgres/participant-registration.js'),{ContactTokenVault}=require('../dist/src/adapters/security/contact-token-vault.js'),{tokenHash}=require('../dist/src/adapters/postgres/account-transaction.js');
const {PostgresGroupInvitations}=require('../dist/src/adapters/postgres/group-invitations.js'),{PostgresStageAccess}=require('../dist/src/adapters/postgres/stage-access.js');
const {PostgresParticipantStages}=require('../dist/src/adapters/postgres/participant-stages.js'),{PostgresParticipantConsents}=require('../dist/src/adapters/postgres/participant-consents.js'),{PostgresParticipantEnrollment}=require('../dist/src/adapters/postgres/participant-enrollment.js');
async function umicsFixture(){
 const f=await postgresFixture({runtimePoolSize:3});
 try{
  const c=await f.admin.connect();let release;try{await c.query('BEGIN');release=await require('../scripts/import-umics-local.js').importUmicsLocal(c);await c.query('COMMIT');}finally{c.release();}
  const staff=await verifiedStaff(f),r=await studyResearcher(f,staff),store=new PostgresResearchWorkbench(f.runtime);
  let d=await r.studies.create(r.session.token,'Synthetic mixed methods');d=await store.change(r.session.token,d.id,d.version,'stage',{id:d.stages[0].id,code:'T0',note:'Synthetic baseline'});d=await store.change(r.session.token,d.id,d.version,'assign',{all:true,release_ids:[f.seed.release_id,release]});d=await r.studies.lifecycle(r.session.token,d.id,{expected_version:d.version,status:'active'});d=await store.read(r.session.token,d.id);
  const invite=await new PostgresGroupInvitations(f.runtime).create(r.session.token,d.id,d.groups[0].id,{expires_at:Date.now()+86400000}),vault=new ContactTokenVault(randomBytes(32)),registration=new PostgresParticipantRegistration(f.runtime,vault),browser=randomBytes(32).toString('base64url'),password=randomBytes(24).toString('base64url'),email='umics-synthetic@example.test';
  await registration.start(invite.invite_token,{email,password,contact_notice_version:'demo-contact-2',accept_contact_notice:true},browser);
  const out=(await f.admin.query("SELECT o.id,o.token_envelope FROM pedpsy.contact_confirmation_outbox o JOIN pedpsy.registration_pending p ON p.id=o.pending_id WHERE p.study_id=$1 AND p.browser_hash=$2 AND p.status='pending'",[d.id,tokenHash(browser)])).rows[0];await registration.confirm(invite.invite_token,{confirmation_token:vault.open(out.id,out.token_envelope)},browser);
  const session=await registration.login({study_id:d.id,email,password}),profiles=new PostgresParticipantProfiles(f.runtime);let profile=await profiles.read(session.token);profile=await profiles.change(session.token,'save',{schema_version:profile.schema_version,expected_revision:profile.revision,values:{sex:'female',age:30}});await profiles.change(session.token,'complete',{schema_version:profile.schema_version,expected_revision:profile.revision});
  await new PostgresParticipantConsents(f.runtime).accept(session.token,{purpose:'study_participation',document_version:'demo-participation-2',expected_policy_revision:0,accept:true});await new PostgresStageAccess(f.runtime).open(r.session.token,d.id,d.groups[0].id,d.stages[0].id,{expected_revision:0});
  const own=await new PostgresParticipantStages(f.runtime).read(session.token),admitted=await new PostgresParticipantEnrollment(f.runtime).enroll(session.token,{stage_id:d.stages[0].id,expected_opening_revision:1,expected_passport_schema_version:own.passport_schema_version,expected_consent_policy_revision:0});
  const attempts=(await f.admin.query('SELECT id,release_id FROM pedpsy.attempts WHERE id=ANY($1::uuid[])',[admitted.attempts.map(a=>a.attempt_id)])).rows;
  return {f,r,store,d,session,release,umics:attempts.find(a=>a.release_id===release).id,tki:attempts.find(a=>a.release_id===f.seed.release_id).id,close:()=>f.close()};
 }catch(e){await f.close();throw e;}
}
module.exports={umicsFixture};
