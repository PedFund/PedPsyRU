"use strict";
const {test} = require("node:test");
const assert = require("node:assert/strict");
const {spawn} = require("node:child_process");
const path = require("node:path");
const {postgresFixture} = require("./postgres-fixture.js");
const {completedSnapshotSource} = require("./snapshot-fixture.js");
const {exportDemoSnapshot,importDemoSnapshot,inspectPostgresSnapshot} = require("../dist/src/adapters/postgres/snapshot.js");
const {migratePostgres,grantRuntime} = require("../dist/src/adapters/postgres/migrate.js");
async function target(t,initialize=true) {const f=await postgresFixture({seedData:false,initialize});t.after(()=>f.close());return f;}
async function imported(t) {
  const source=await completedSnapshotSource();t.after(()=>source.db.close());
  const snapshot=exportDemoSnapshot(source.db), f=await target(t), client=await f.admin.connect();
  try {await importDemoSnapshot(client,snapshot);} finally {client.release();}
  return {...f,source,snapshot};
}
test("PostgreSQL snapshot: exact UUIDs/times/revisions/digests/score survive SQLite import",async t=>{
  const f=await imported(t),client=await f.admin.connect();
  try {
    assert.deepEqual(await inspectPostgresSnapshot(client),f.snapshot);
    for (const table of ["participant_credentials","participant_sessions","staff_credentials","staff_sessions","access_audit_events"])
      assert.equal((await client.query("SELECT count(*)::integer n FROM pedpsy."+table)).rows[0].n,0);
    assert.deepEqual(exportDemoSnapshot(f.source.db),f.snapshot);
    await assert.rejects(importDemoSnapshot(client,f.snapshot),/EMPTY_TARGET_REQUIRED/);
    assert.deepEqual(await inspectPostgresSnapshot(client),f.snapshot);
  } finally {client.release();}
});
test("PostgreSQL snapshot: target failure rolls back whole import, source stays intact",async t=>{
  const source=await completedSnapshotSource();t.after(()=>source.db.close());const snapshot=exportDemoSnapshot(source.db),f=await target(t);
  await f.admin.query("CREATE FUNCTION pedpsy.synthetic_import_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic import failure'; END $$; CREATE TRIGGER synthetic_import_failure BEFORE INSERT ON pedpsy.responses FOR EACH ROW EXECUTE FUNCTION pedpsy.synthetic_import_fail()");
  const client=await f.admin.connect();
  try {
    await assert.rejects(importDemoSnapshot(client,snapshot),/synthetic import failure/);
    assert.equal((await client.query("SELECT count(*)::integer n FROM pedpsy.studies")).rows[0].n,0);
    assert.deepEqual(exportDemoSnapshot(source.db),snapshot);
    await client.query("DROP TRIGGER synthetic_import_failure ON pedpsy.responses; DROP FUNCTION pedpsy.synthetic_import_fail()");
    await importDemoSnapshot(client,snapshot);assert.deepEqual(await inspectPostgresSnapshot(client),snapshot);
  } finally {client.release();}
});
function dockerTool(args,input) {
  const container=process.env.PGTEST_CONTAINER;
  if(process.env.PEDPSY_PG_TEST!=="1"||!container||!/^[a-f0-9]{64}$/.test(container))throw new Error("EXPLICIT_SYNTHETIC_CONTAINER_REQUIRED");
  return new Promise((resolve,reject)=>{
    const p=spawn("docker",["exec",...(input?["-i"]:[]),container,...args],{stdio:["pipe","pipe","pipe"],shell:false});
    const output=[];let size=0;
    const timer=setTimeout(()=>{p.kill();reject(new Error("PG_TOOL_TIMEOUT"));},30000);
    p.stdout.on("data",b=>{size+=b.length;if(size>4*1024*1024){p.kill();reject(new Error("SYNTHETIC_ARCHIVE_TOO_LARGE"));}else output.push(b);});
    // Never echo stderr, backup data, login information or SQL statement values.
    p.stderr.resume();p.stdin.on("error",()=>{});
    p.on("error",e=>{clearTimeout(timer);reject(e);});
    p.on("close",code=>{clearTimeout(timer);if(code!==0)reject(new Error("PG_TOOL_FAILED"));else resolve(Buffer.concat(output));});
    p.stdin.end(input);
  });
}
test("PostgreSQL backup: pg_dump custom archive restores data/schema/RLS to independent empty DB",async t=>{
  const f=await imported(t), restored=await target(t,false);
  for(const name of [f.database,restored.database])assert.match(name,/^pedpsy_ci_[a-f0-9]{16}$/);
  const archive=await dockerTool(["pg_dump","-U","postgres","--format=custom","--no-owner","--no-privileges",f.database]);
  assert.equal(archive.subarray(0,5).toString(),"PGDMP");
  await dockerTool(["pg_restore","-U","postgres","--dbname="+restored.database,"--no-owner","--no-privileges","--single-transaction","--exit-on-error"],archive);
  const client=await restored.admin.connect();
  try {
    // Quarantined owner-only restore is hardened before a runtime is enabled.
    await client.query("REVOKE ALL ON SCHEMA pedpsy FROM PUBLIC; REVOKE CREATE ON SCHEMA public FROM PUBLIC; REVOKE ALL ON ALL TABLES IN SCHEMA pedpsy FROM PUBLIC; REVOKE ALL ON ALL FUNCTIONS IN SCHEMA pedpsy FROM PUBLIC; REVOKE ALL ON public.pedpsy_schema_migrations FROM PUBLIC");
    await grantRuntime(client,restored.runtimeRole);
    assert.equal(await migratePostgres(client,path.join(__dirname,"../storage/postgres")),0);
    assert.deepEqual(await inspectPostgresSnapshot(client),f.snapshot);
    assert.equal((await client.query("SELECT count(*)::integer n FROM pedpsy.participant_sessions")).rows[0].n,0);
    assert.equal((await client.query("SELECT count(*)::integer n FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl WHERE p.pronamespace='pedpsy'::regnamespace AND acl.grantee=0 AND acl.privilege_type='EXECUTE'")).rows[0].n,0);
    assert.equal((await restored.runtime.query("SELECT * FROM pedpsy.attempts")).rowCount,0);
    await assert.rejects(restored.runtime.query("SELECT * FROM pedpsy.participant_credentials"),/permission denied/);
    await assert.rejects(client.query("UPDATE pedpsy.attempt_results SET responses_digest='sha256:'||repeat('0',64)"),/immutable/);
    const original=await f.admin.connect();try{assert.deepEqual(await inspectPostgresSnapshot(original),f.snapshot);}finally{original.release();}
  } finally {client.release();}
  archive.fill(0); // In-memory synthetic archive only, never an uploaded artifact.
});
