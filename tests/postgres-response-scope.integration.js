"use strict";
// P0-3: the guarded response read performs authorization once and returns only
// the rows of the caller's attempt, while the row-level policy stays in place.
const {test} = require("node:test"), assert = require("node:assert/strict");
const {postgresFixture} = require("./postgres-fixture.js");

test("P0-3: own attempt responses are returned by the guarded function", async t => {
  const f = await postgresFixture(); t.after(() => f.close());
  const own = f.seed.studies[0].attempts.find(a => a.participant_id === f.participant.id);
  assert.ok(own, "the synthetic participant has an attempt");
  const expected = (await f.admin.query("SELECT item_id,value FROM pedpsy.responses WHERE attempt_id=$1 ORDER BY item_id", [own.id])).rows;
  const actual = (await f.withSession(c => c.query("SELECT item_id,value FROM pedpsy.own_attempt_responses($1)", [own.id]))).rows;
  assert.deepEqual(actual, expected);
});

test("P0-3: another participant's attempt yields no rows (RLS-equivalent visibility)", async t => {
  const f = await postgresFixture(); t.after(() => f.close());
  const other = f.seed.studies[0].attempts.find(a => a.participant_id !== f.participant.id);
  assert.ok(other);
  const rows = (await f.withSession(c => c.query("SELECT item_id,value FROM pedpsy.own_attempt_responses($1)", [other.id]))).rows;
  assert.equal(rows.length, 0);
});

test("P0-3: an unauthenticated caller is rejected", async t => {
  const f = await postgresFixture(); t.after(() => f.close());
  const own = f.seed.studies[0].attempts.find(a => a.participant_id === f.participant.id);
  await assert.rejects(f.withSession(c => c.query("SELECT * FROM pedpsy.own_attempt_responses($1)", [own.id]), ""),
    error => error.code === "28000");
});
