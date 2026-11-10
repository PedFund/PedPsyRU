"use strict";
// Staging-only synthetic demo seed. It creates one demo study owned by an
// existing researcher and completes 3-4 methods for ten @example.test
// participants. It refuses anything that is not a pedpsy_staging_* database.
const fs=require("node:fs");
const {randomUUID,randomBytes,createHash}=require("node:crypto");
const {Pool}=require("pg");
const {PostgresParticipantRegistration}=require("../dist/src/adapters/postgres/participant-registration.js");
const {PostgresParticipantConsents}=require("../dist/src/adapters/postgres/participant-consents.js");
const {PostgresParticipantPassports}=require("../dist/src/adapters/postgres/participant-passports.js");
const {PostgresParticipantEnrollment}=require("../dist/src/adapters/postgres/participant-enrollment.js");
const {ContactTokenVault}=require("../dist/src/adapters/security/contact-token-vault.js");
const {tokenHash}=require("../dist/src/adapters/postgres/account-transaction.js");
const {csrfFor}=require("../storage/access.js");

const LOGIN="R-89D09FEE5AAB9577";
const TITLE="\u0414\u0435\u043c\u043e-\u0438\u0441\u0441\u043b\u0435\u0434\u043e\u0432\u0430\u043d\u0438\u0435 (\u0441\u0438\u043d\u0442\u0435\u0442\u0438\u043a\u0430)";
const METHODS=["tki_ru_30_pairs","sjo_20","hardiness_leontiev_rasskazova_45","qlesq_36_vodopyanova"];
const PARTICIPANTS=10;
const COMPLETED=[4,4,4,4,4,4,4,0,0,0]; // 7 of 10 completed at least one method
const envPath="/etc/mettest/app.env";

function parseEnv(text){
  const out={};
  for(const line of text.split(/\r?\n/)){
    const m=/^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if(m)out[m[1]]=m[2];
  }
  return out;
}
function sha(value){return "sha256:"+createHash("sha256").update(value).digest("hex");}
function requireEnv(name){const value=process.env[name];if(!value)throw new Error("ENV_REQUIRED: "+name);return value;}

async function main(){
  if(process.env.PEDPSY_STAGING_SYNTHETIC!=="1")throw new Error("PEDPSY_STAGING_SYNTHETIC=1 is required");
  const database=requireEnv("PGDATABASE");
  if(!/^pedpsy_staging_[a-f0-9]{16}$/.test(database))throw new Error("STAGING_DATABASE_REQUIRED");
  const app=parseEnv(fs.readFileSync(envPath,"utf8"));
  const origin=app.PEDPSY_PUBLIC_ORIGIN||"https://mettest.87-228-83-218.sslip.io";
  if(!app.PEDPSY_CONTACT_KEY)throw new Error("CONTACT_KEY_REQUIRED");
  const vault=new ContactTokenVault(Buffer.from(app.PEDPSY_CONTACT_KEY,"base64"));
  const pool=new Pool({host:process.env.PGHOST,port:Number(process.env.PGPORT||5432),database,user:process.env.PGUSER,password:process.env.PGPASSWORD});
  const runtimePool=new Pool({host:app.PGHOST||process.env.PGHOST,port:Number(app.PGPORT||process.env.PGPORT||5432),database,user:app.PGUSER,password:app.PGPASSWORD});

  try{
    const owner=await pool.connect();
    let study,group,stage,credential,user,openingRevision=1;
    try{
      await owner.query("BEGIN");
      const researcher=(await owner.query("SELECT id,user_id FROM pedpsy.researcher_credentials WHERE login_id=$1 AND status='active' FOR UPDATE",[LOGIN])).rows[0];
      if(!researcher)throw new Error("RESEARCHER_NOT_FOUND");
      credential=researcher.id;user=researcher.user_id;
      const existing=(await owner.query("SELECT id FROM pedpsy.studies WHERE title=$1 AND status='active' ORDER BY created_at DESC LIMIT 1",[TITLE])).rows[0];
      if(existing){
        study=existing.id;
        group=(await owner.query("SELECT id FROM pedpsy.research_groups WHERE study_id=$1 AND status='active' ORDER BY created_at LIMIT 1",[study])).rows[0].id;
        stage=(await owner.query("SELECT id FROM pedpsy.research_stages WHERE study_id=$1 AND status='active' ORDER BY ordinal LIMIT 1",[study])).rows[0].id;
      }else{
        const template=(await owner.query("SELECT id FROM pedpsy.studies WHERE status='active' AND EXISTS(SELECT 1 FROM pedpsy.assignments a WHERE a.study_id=pedpsy.studies.id AND a.status='active') ORDER BY created_at DESC LIMIT 1")).rows[0];
        if(!template)throw new Error("TEMPLATE_STUDY_REQUIRED");
        const tpl=template.id;
        const tplGroup=(await owner.query("SELECT id,name,kind FROM pedpsy.research_groups WHERE study_id=$1 AND status='active' ORDER BY created_at LIMIT 1",[tpl])).rows[0];
        const tplStage=(await owner.query("SELECT id,code,ordinal FROM pedpsy.research_stages WHERE study_id=$1 AND status='active' ORDER BY ordinal LIMIT 1",[tpl])).rows[0];
        const releases=(await owner.query("SELECT r.method_id,a.release_id FROM pedpsy.assignments a JOIN pedpsy.instrument_releases r ON r.id=a.release_id WHERE a.study_id=$1 AND a.status='active'",[tpl])).rows;
        study=randomUUID();group=randomUUID();stage=randomUUID();
        await owner.query("INSERT INTO pedpsy.studies(id,title,status,dataset_kind,design_version) VALUES($1,$2,'draft','demo',1)",[study,TITLE]);
        await owner.query("INSERT INTO pedpsy.study_memberships(study_id,user_id,role) VALUES($1,$2,'researcher')",[study,user]);
        await owner.query("INSERT INTO pedpsy.research_groups(id,study_id,name,kind) VALUES($1,$2,$3,$4)",[group,study,tplGroup?.name||"Р­Р“",tplGroup?.kind||"experimental"]);
        await owner.query("INSERT INTO pedpsy.research_stages(id,study_id,code,ordinal) VALUES($1,$2,$3,$4)",[stage,study,tplStage?.code||"T0",tplStage?.ordinal||0]);
        for(const method of METHODS){
          const release=releases.find(r=>r.method_id===method);
          if(!release)throw new Error("METHOD_NOT_ASSIGNED_IN_TEMPLATE: "+method);
          await owner.query("INSERT INTO pedpsy.assignments(id,study_id,group_id,stage_id,release_id,status) VALUES($1,$2,$3,$4,$5,'active')",[randomUUID(),study,group,stage,release.release_id]);
        }
        const schema=(await owner.query("SELECT schema_version,fields FROM pedpsy.passport_schema_versions WHERE study_id=$1 ORDER BY schema_version DESC LIMIT 1",[tpl])).rows[0];
        if(schema){
          await owner.query("INSERT INTO pedpsy.study_passport_schemas(study_id,schema_version) VALUES($1,$2) ON CONFLICT DO NOTHING",[study,schema.schema_version]);
          await owner.query("INSERT INTO pedpsy.passport_schema_versions(study_id,schema_version,fields) VALUES($1,$2,$3::jsonb) ON CONFLICT DO NOTHING",[study,schema.schema_version,JSON.stringify(schema.fields)]);
        }
        await owner.query("INSERT INTO pedpsy.group_stage_access(id,study_id,group_id,stage_id,revision,opened_at_ms,opened_by_researcher) VALUES($1,$2,$3,$4,1,$5,$6)",[randomUUID(),study,group,stage,Date.now(),credential]);
        await owner.query("UPDATE pedpsy.studies SET status='active' WHERE id=$1",[study]);
      }
      const access=(await owner.query("SELECT revision FROM pedpsy.group_stage_access WHERE study_id=$1 AND group_id=$2 AND stage_id=$3",[study,group,stage])).rows[0];
      if(!access)throw new Error("STAGE_NOT_OPEN");
      openingRevision=access.revision;
      await owner.query("COMMIT");
    }catch(e){await owner.query("ROLLBACK").catch(()=>{});throw e;}
    finally{owner.release();}

    const token=randomBytes(32).toString("base64url"),now=Date.now();
    await pool.query("UPDATE pedpsy.group_invitations SET status='revoked',revoked_at_ms=$3 WHERE study_id=$1 AND group_id=$2 AND status='active'",[study,group,now]);
    await pool.query("INSERT INTO pedpsy.group_invitations(id,study_id,group_id,token_hash,status,revision,created_by,created_at_ms,expires_at_ms) VALUES($1,$2,$3,$4,'active',0,$5,$6,$7)",[randomUUID(),study,group,sha(token),credential,now,now+7*86400000]);

    const registration=new PostgresParticipantRegistration(runtimePool,vault),consents=new PostgresParticipantConsents(runtimePool),passports=new PostgresParticipantPassports(runtimePool),enrollment=new PostgresParticipantEnrollment(runtimePool);
    const landing=await registration.landing(token);
    for(let n=1;n<=PARTICIPANTS;n++){
      const email=`demo${String(n).padStart(2,"0")}@example.test`;
      const existing=(await pool.query("SELECT 1 FROM pedpsy.participant_contacts WHERE study_id=$1 AND email_key=$2",[study,email])).rows[0];
      if(existing)continue;
      const password="synthetic-"+randomBytes(18).toString("base64url"),browser=randomBytes(32).toString("base64url");
      await registration.start(token,{email,password,contact_notice_version:landing.contact_notice.version,accept_contact_notice:true},browser);
      const out=(await pool.query("SELECT o.id,o.token_envelope FROM pedpsy.contact_confirmation_outbox o JOIN pedpsy.registration_pending p ON p.id=o.pending_id WHERE p.study_id=$1 AND p.browser_hash=$2 AND p.status='pending'",[study,tokenHash(browser)])).rows[0];
      if(!out)throw new Error("CONFIRMATION_OUTBOX_MISSING");
      await registration.confirm(token,{confirmation_token:vault.open(out.id,out.token_envelope)},browser);
      const session=await registration.login({study_id:study,email,password});
      const co=await consents.read(session.token),participation=co.documents.find(d=>d.purpose==="study_participation");
      if(!participation)throw new Error("CONSENT_DOCUMENT_MISSING");
      await consents.accept(session.token,{purpose:"study_participation",document_version:participation.version,expected_policy_revision:co.policy_revision,accept:true});
      let pp=await passports.read(session.token);
      pp=await passports.save(session.token,{schema_version:pp.schema_version,expected_revision:pp.revision,values:{sex:n%2?"female":"male",age:20+n,city:"\u041c\u043e\u0441\u043a\u0432\u0430"}});
      pp=await passports.complete(session.token,{schema_version:pp.schema_version,expected_revision:pp.revision});
      const admitted=await enrollment.enroll(session.token,{stage_id:stage,expected_opening_revision:openingRevision,expected_passport_schema_version:pp.schema_version,expected_consent_policy_revision:co.policy_revision});
      const completeCount=COMPLETED[n-1]||0;
      for(const attempt of admitted.attempts.slice(0,completeCount)){
        if(attempt.status==="completed")continue;
        const form=await request(origin,`/api/v2/participant/attempts/${attempt.attempt_id}/form`,{headers:{cookie:`__Host-pedpsy=${session.token}`,origin}});
        const responses=form.items.map(item=>{
          const options=item.options||[],option=options[Math.floor((options.length-1)/2)]||options[0];
          if(!option)throw new Error("ITEM_WITHOUT_OPTIONS: "+item.id);
          return {item_id:item.id,value:String(option.value)};
        });
        await request(origin,`/api/v2/participant/attempts/${attempt.attempt_id}/draft`,{method:"PUT",headers:{cookie:`__Host-pedpsy=${session.token}`,origin,"content-type":"application/json","x-pedpsy-csrf":csrfFor(session.token)},body:JSON.stringify({expected_revision:0,current_item_id:form.items[form.items.length-1].id,responses})});
        await request(origin,`/api/v2/participant/attempts/${attempt.attempt_id}/complete`,{method:"POST",headers:{cookie:`__Host-pedpsy=${session.token}`,origin,"content-type":"application/json","x-pedpsy-csrf":csrfFor(session.token)},body:JSON.stringify({expected_revision:1})});
      }
      console.log(`SEEDED ${email} completed=${completeCount}`);
    }
    const counts=(await pool.query("SELECT count(*)::integer registered FROM pedpsy.participant_contacts WHERE study_id=$1 AND email_key LIKE 'demo%@example.test'",[study])).rows[0];
    console.log("STUDY="+study+" GROUP="+group+" STAGE="+stage+" REGISTERED="+counts.registered);
  }finally{await Promise.allSettled([pool.end(),runtimePool.end()]);}
}
async function request(origin,path,options={}){
  const response=await fetch(origin+path,options);
  const body=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error("HTTP "+response.status+" "+path+" "+(body.error||""));
  return body;
}
main().catch(error=>{console.error("SEED_FAILED: "+error.message);console.error(error.stack);process.exitCode=1;});

