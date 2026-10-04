"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),os=require("node:os"),{randomUUID,randomBytes}=require("node:crypto");
const {postgresFixture}=require("./postgres-fixture.js"),{migratePostgres,grantRuntime}=require("../dist/src/adapters/postgres/migrate.js"),{tokenHash}=require("../dist/src/adapters/postgres/account-transaction.js");
test("PostgreSQL staff migration: 019 existing researcher invitation survives append-only 020 upgrade",async t=>{
  const f=await postgresFixture({initialize:false,seedData:false}),source=path.join(__dirname,"../storage/postgres"),directory=fs.mkdtempSync(path.join(os.tmpdir(),"pedpsy-upgrade-"));
  t.after(async()=>{await f.close();const target=path.resolve(directory);if(path.dirname(target)!==path.resolve(os.tmpdir())||!path.basename(target).startsWith("pedpsy-upgrade-"))throw Error("UNSAFE_UPGRADE_FIXTURE_TARGET");fs.rmSync(target,{recursive:true});});
  for(const name of fs.readdirSync(source).filter(n=>/^0(0[1-9]|1[0-9])_.*\.sql$/.test(n)))fs.copyFileSync(path.join(source,name),path.join(directory,name));
  const c=await f.admin.connect();try{
    assert.equal(await migratePostgres(c,directory),19);
    const user=randomUUID(),credential=randomUUID(),study=randomUUID(),group=randomUUID(),invite=randomUUID(),at=Date.now();
    await c.query("INSERT INTO pedpsy.users(id) VALUES($1)",[user]);
    await c.query("INSERT INTO pedpsy.researcher_credentials(id,user_id,login_id,scheme,salt,password_hash) VALUES($1,$2,'SYNTHETIC-UPGRADE','scrypt-N131072-r8-p1-dk64',$3,$4)",[credential,user,randomBytes(16).toString("hex"),randomBytes(64).toString("hex")]);
    await c.query("INSERT INTO pedpsy.studies(id,title) VALUES($1,'Synthetic existing')",[study]);
    await c.query("INSERT INTO pedpsy.research_groups(id,study_id,name,kind) VALUES($1,$2,'Existing group','control')",[group,study]);
    await c.query("INSERT INTO pedpsy.group_invitations(id,study_id,group_id,token_hash,created_by,created_at_ms,expires_at_ms) VALUES($1,$2,$3,$4,$5,$6,$7)",[invite,study,group,tokenHash(randomBytes(32).toString("base64url")),credential,at,at+86400000]);
    const before=(await c.query("SELECT * FROM pedpsy.group_invitations WHERE id=$1",[invite])).rows[0];
    const latest=fs.readdirSync(source).filter(n=>/^\d{3}_[a-z0-9_]+\.sql$/.test(n)).length;
    assert.equal(await migratePostgres(c,source),latest-19);assert.equal(await migratePostgres(c,source),0);
    const {created_by_staff,...after}=(await c.query("SELECT * FROM pedpsy.group_invitations WHERE id=$1",[invite])).rows[0];
    assert.equal(created_by_staff,null);assert.deepEqual(after,before);
    await grantRuntime(c,f.runtimeRole);await assert.rejects(f.runtime.query("SELECT * FROM pedpsy.group_invitations"),e=>e.code==="42501");
    assert.equal((await c.query("SELECT count(*)::integer n FROM public.pedpsy_schema_migrations")).rows[0].n,latest);
  }finally{c.release();}
});
