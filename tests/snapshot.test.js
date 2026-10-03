"use strict";
const {test} = require("node:test");
const assert = require("node:assert/strict");
const {completedSnapshotSource} = require("./snapshot-fixture.js");
const {exportDemoSnapshot,importDemoSnapshot} = require("../dist/src/adapters/postgres/snapshot.js");
test("snapshot preserves completed result and excludes all credentials/sessions/audit", async t => {
  const f = await completedSnapshotSource(); t.after(()=>f.db.close());
  const total = f.db.prepare("SELECT total_changes() n").get().n;
  const s = exportDemoSnapshot(f.db), again = exportDemoSnapshot(f.db);
  assert.deepEqual(s,again); assert.equal(f.db.prepare("SELECT total_changes() n").get().n,total);
  assert.equal(s.tables.attempt_results.length,1); assert.equal(s.tables.attempt_results[0].id,f.result.id);
  assert.deepEqual(s.tables.attempt_results[0].payload,f.result.payload);
  assert.equal(JSON.stringify(s).includes(f.session.token),false);
  for (const table of ["participant_credentials","participant_sessions","staff_credentials","staff_sessions","access_audit_events"]) assert.equal(Object.hasOwn(s.tables,table),false);
  assert.equal(f.db.isTransaction,false);
});
test("snapshot tamper is rejected before target transaction", async t => {
  const f = await completedSnapshotSource(); t.after(()=>f.db.close()); const s=exportDemoSnapshot(f.db);
  let touched=false; const client={query:async()=>{touched=true;throw new Error("unexpected target call");}};
  const response=s.tables.responses.find(r=>r.attempt_id===f.attemptId); response.value=response.value==="A"?"B":"A";
  await assert.rejects(importDemoSnapshot(client,s),/SNAPSHOT_RESULT_MISMATCH/); assert.equal(touched,false);
});
test("non-demo source is rejected without changing any source row", async t => {
  const f = await completedSnapshotSource(); t.after(()=>f.db.close()); const s=exportDemoSnapshot(f.db);
  s.tables.studies[0].dataset_kind="real";
  await assert.rejects(importDemoSnapshot({query:async()=>assert.fail("target touched")},s),/DEMO_ONLY_SNAPSHOT/);
  assert.equal(exportDemoSnapshot(f.db).tables.studies[0].dataset_kind,"demo");
});
