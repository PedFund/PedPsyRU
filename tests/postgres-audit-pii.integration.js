"use strict";
// Logging hygiene: audit rows must stay pseudonymous and code-only. The check runs
// a full participant flow and then inspects every audit row: only the documented
// columns, no contact address, no answers and a machine-readable reason code.
const {test}=require("node:test"),assert=require("node:assert/strict");
const {postgresFixture}=require("./postgres-fixture.js"),{stageSetup,selection,prepare}=require("./participant-enrollment-fixture.js");
const ALLOWED=new Set(["id","at_ms","credential_id","study_id","action","outcome","reason","actor_role","resource_id","record_count"]);
test("PostgreSQL audit: rows keep the documented columns and carry no personal data",async t=>{
  const f=await postgresFixture({runtimePoolSize:3});t.after(()=>f.close());
  const x=await stageSetup(f);
  await prepare(x);
  await x.enrollment.enroll(x.session.token,selection(x));
  const rows=(await f.admin.query("SELECT * FROM pedpsy.access_audit_events")).rows;
  assert.ok(rows.length>=5,"the flow must produce audit rows");
  const actions=new Set();
  for(const row of rows){
    for(const key of Object.keys(row))assert.ok(ALLOWED.has(key),"unexpected audit column "+key);
    assert.doesNotMatch(JSON.stringify(row),/@/,"audit rows must not contain a contact address");
    assert.equal(typeof row.action,"string");assert.match(row.action,/^[a-z0-9_.]+$/,"action is a dotted code");
    assert.match(row.reason,/^[A-Z0-9_]+$/,"reason is an uppercase machine code");
    assert.ok(["allow","deny"].includes(row.outcome));
    actions.add(row.action);
  }
  assert.ok([...actions].some(action=>action.startsWith("participants.registration")),"registration is audited");
  assert.ok(actions.has("participants.passport.complete"),"passport completion is audited");
  assert.ok(actions.has("participants.stages.enroll"),"stage admission is audited");
});
