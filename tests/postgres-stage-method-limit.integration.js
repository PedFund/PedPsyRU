"use strict";
// The per-group/per-stage method ceiling is 30 after migration 073. There are not
// enough allowed releases in the synthetic stand to exercise 30 real methods, so
// the boundary is proved twice: 31 unique IDs are rejected by the limit, while 30
// unique IDs pass the limit and fail later because those releases do not exist.
const {test} = require("node:test"), assert = require("node:assert/strict"), {randomUUID} = require("node:crypto");
const {postgresFixture} = require("./postgres-fixture.js");
const {verifiedStaff} = require("./mfa-fixture.js");
const {studyResearcher} = require("./study-fixture.js");
const {PostgresResearchWorkbench} = require("../dist/src/adapters/postgres/research-workbench.js");

test("PostgreSQL stage assignment accepts 30 methods per group and rejects 31", async t => {
  const f = await postgresFixture({runtimePoolSize: 2});
  t.after(() => f.close());
  const staff = await verifiedStaff(f), researcher = await studyResearcher(f, staff);
  const store = new PostgresResearchWorkbench(f.runtime);
  const design = await researcher.studies.create(researcher.session.token, "Synthetic method ceiling");
  const group = design.groups[0].id, stage = design.stages[0].id;
  const ids = count => Array.from({length: count}, () => randomUUID());

  await assert.rejects(
    () => store.change(researcher.session.token, design.id, design.version, "assign",
      {all: false, group_id: group, stage_id: stage, release_ids: ids(31)}),
    error => error.code === "INVALID_STUDY_INPUT"
  );
  await assert.rejects(
    () => store.change(researcher.session.token, design.id, design.version, "assign",
      {all: false, group_id: group, stage_id: stage, release_ids: ids(30)}),
    error => error.code === "NOT_AVAILABLE"
  );

  const defs = (await f.admin.query(
    `SELECT p.proname, pg_get_functiondef(p.oid) AS def FROM pg_proc p
       JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='pedpsy' AND p.proname IN
        ('configure_study_assignments','read_own_stages','lock_own_stage_requirements')`)).rows;
  assert.equal(defs.length, 3);
  for (const row of defs) {
    assert.match(row.def, />30/, row.proname);
    assert.doesNotMatch(row.def, />10/, row.proname);
  }
});
