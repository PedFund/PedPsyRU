"use strict";
// P0-1: the participant session read must be bounded by the caller's own
// enrollments, while the row-level policy keeps its per-row ownership check.
const {test} = require("node:test"), assert = require("node:assert/strict");
const {postgresFixture} = require("./postgres-fixture.js");

test("P0-1: scoped attempt read returns only the session participant's attempts", async t => {
  const f = await postgresFixture(); t.after(() => f.close());
  const result = await f.withSession(c => c.query(
    "SELECT id,study_id FROM pedpsy.attempts WHERE study_id=$1 AND enrollment_id=ANY(pedpsy.own_enrollment_ids()) ORDER BY id", [f.studyId]));
  assert.equal(result.rowCount, 3, "T0/T1/T2 of the session participant only");
  const own = new Set(result.rows.map(row => row.id));
  for (const row of result.rows) assert.equal(row.study_id, f.studyId);
  const all = await f.admin.query("SELECT id FROM pedpsy.attempts WHERE study_id=$1", [f.studyId]);
  assert.ok(all.rowCount > result.rowCount, "the study has attempts of other participants");
  for (const row of all.rows) if (!own.has(row.id)) assert.ok(!own.has(row.id));
});

test("P0-1: scoped read does not leak another participant or another study", async t => {
  const f = await postgresFixture(); t.after(() => f.close());
  const other = f.seed.studies[0].attempts.find(a => a.participant_id !== f.participant.id);
  assert.ok(other, "the synthetic study contains another participant's attempt");
  const foreign = await f.admin.query("SELECT id FROM pedpsy.attempts WHERE study_id=$1 AND id<>ALL($2::uuid[])",
    [f.studyId, f.seed.studies[0].attempts.filter(a => a.participant_id === f.participant.id).map(a => a.id)]);
  assert.ok(foreign.rowCount > 0);
  const scoped = await f.withSession(c => c.query(
    "SELECT id FROM pedpsy.attempts WHERE study_id=$1 AND enrollment_id=ANY(pedpsy.own_enrollment_ids()) AND id=$2", [f.studyId, other.id]));
  assert.equal(scoped.rowCount, 0, "another participant's attempt is outside the scope");
});

test("P0-1: RLS still denies a direct read of another participant's attempt", async t => {
  const f = await postgresFixture(); t.after(() => f.close());
  const other = f.seed.studies[0].attempts.find(a => a.participant_id !== f.participant.id);
  const direct = await f.withSession(c => c.query("SELECT id FROM pedpsy.attempts WHERE id=$1", [other.id]));
  assert.equal(direct.rowCount, 0, "the row-level policy is still the final authority");
});

test("P0-1: the helper refuses an unauthenticated caller", async t => {
  const f = await postgresFixture(); t.after(() => f.close());
  await assert.rejects(f.withSession(c => c.query("SELECT pedpsy.own_enrollment_ids()"), ""),
    error => error.code === "28000");
});

test("P0-1: the helper returns exactly the participant's enrollments", async t => {
  const f = await postgresFixture(); t.after(() => f.close());
  const ids = (await f.withSession(c => c.query("SELECT pedpsy.own_enrollment_ids() AS ids"))).rows[0].ids;
  const expected = await f.admin.query("SELECT id FROM pedpsy.stage_enrollments WHERE study_id=$1 AND participant_id=$2 ORDER BY id",
    [f.studyId, f.participant.id]);
  assert.deepEqual(ids, expected.rows.map(row => row.id));
});
