"use strict";
const {test} = require("node:test");
const assert = require("node:assert/strict");
const {randomUUID} = require("node:crypto");
const {postgresFixture} = require("./postgres-fixture.js");
const {registerStorageContracts, responses} = require("./storage-contract-suite.js");
const {responsesDigest} = require("../storage/releases.js");
const {scoreTki, CONTRACT_VERSION, METHOD_VERSION_ID, HANDLER_VERSION} = require("../core/tki-contract.js");
const {PostgresUnitOfWork} = require("../dist/src/adapters/postgres/unit-of-work.js");
const {createParticipationService} = require("../dist/src/application/participation.js");
async function fixture() {
  const f = await postgresFixture({runtimePoolSize: 2});
  const uow = new PostgresUnitOfWork(f.runtime), context = await uow.context(f.raw);
  const attempt = f.seed.studies[0].attempts[0];
  const dependencies = {newId: randomUUID, now: () => new Date().toISOString(), digest: (ids, values) => responsesDigest(ids.map(item_id => ({item_id})), values)};
  return {...f, uow, context, dependencies, service: createParticipationService(uow, dependencies), attemptId: attempt.id,
    foreignId: f.seed.studies[0].attempts.find(a => a.participant_id !== f.participant.id).id, crossStudyId: f.seed.studies[1].attempts[0].id,
    originalScore: values => scoreTki({contract_version: CONTRACT_VERSION, method_version_id: METHOD_VERSION_ID, handler_version: HANDLER_VERSION, responses: values}),
    originalDigest: values => dependencies.digest(responses().map(r => r.item_id), values),
    resultCount: async () => (await f.admin.query("SELECT count(*)::integer n FROM pedpsy.attempt_results")).rows[0].n,
    revoke: () => f.admin.query("UPDATE pedpsy.participant_credentials SET status='revoked',version=version+1 WHERE id=$1", [f.credential]),
    closeAssignment: () => f.admin.query("UPDATE pedpsy.assignments SET status='closed' WHERE id=$1", [attempt.assignment_id]),
    failAudit: async flag => {
      if (flag) await f.admin.query("CREATE FUNCTION pedpsy.synthetic_audit_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic audit failure'; END $$; CREATE TRIGGER synthetic_audit_failure BEFORE INSERT ON pedpsy.access_audit_events FOR EACH ROW EXECUTE FUNCTION pedpsy.synthetic_audit_fail()");
      else await f.admin.query("DROP TRIGGER synthetic_audit_failure ON pedpsy.access_audit_events; DROP FUNCTION pedpsy.synthetic_audit_fail()");
    }};
}
registerStorageContracts("PostgreSQL", fixture);
function scenario(title, callback) {test("PostgreSQL adapter: " + title, async t => {const f = await fixture(); t.after(() => f.close()); await callback(f);});}
async function waitForBlockedRuntime(f) {
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline) {
    const result = await f.admin.query("SELECT 1 FROM pg_stat_activity WHERE datname=$1 AND usename=$2 AND wait_event_type='Lock'", [f.database, f.runtimeRole]);
    if (result.rowCount) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.fail("runtime did not reach the competing lock before owner commit");
}
scenario("nested transaction and ports retained beyond commit are rejected", async f => {
  let leaked;
  await f.uow.run(f.context, async ports => {leaked = ports; await assert.rejects(f.uow.run(f.context, async () => {}), /NESTED_TRANSACTION/);});
  await assert.rejects(leaked.attempts.getAuthorized(f.attemptId), /TRANSACTION_CLOSED/);
  await assert.rejects(leaked.results.getExisting(f.attemptId), /TRANSACTION_CLOSED/);
});
scenario("transaction mutation requires matching mandatory audit", async f => {
  const before = await f.service.read(f.context, f.attemptId);
  await assert.rejects(f.uow.run(f.context, async ports => {await ports.attempts.compareAndSave(f.attemptId,
    {expected_revision: before.revision, current_item_id: "q08", responses: responses()});}), /MANDATORY_AUDIT_MISSING/);
  assert.deepEqual(await f.service.read(f.context, f.attemptId), before);
});
scenario("privileged owner pool is never accepted as runtime", async f => {
  const unsafe = new PostgresUnitOfWork(f.admin);
  await assert.rejects(unsafe.context(f.raw), /UNSAFE_RUNTIME_ROLE/);
});
scenario("committed revocation winning the credential lock prevents late save", async f => {
  const before = await f.service.read(f.context, f.attemptId), owner = await f.admin.connect();
  await owner.query("BEGIN");
  try {
    await owner.query("UPDATE pedpsy.participant_credentials SET status='revoked',version=version+1 WHERE id=$1", [f.credential]);
    const pending = f.service.save(f.context, f.attemptId, {expected_revision: before.revision, current_item_id: "q08", responses: responses()});
    const assertion = assert.rejects(pending, e => e.code === "AUTH_REQUIRED");
    await waitForBlockedRuntime(f); await owner.query("COMMIT"); await assertion;
    const saved = await f.admin.query("SELECT revision,current_item_id FROM pedpsy.attempts WHERE id=$1", [f.attemptId]);
    assert.equal(Number(saved.rows[0].revision), before.revision); assert.equal(saved.rows[0].current_item_id, before.currentItemId);
  } finally {await owner.query("ROLLBACK"); owner.release();}
});
scenario("closing assignment while holding its lock prevents late completion", async f => {
  const before = await f.service.read(f.context, f.attemptId);
  const saved = await f.service.save(f.context, f.attemptId, {expected_revision: before.revision, current_item_id: "q30", responses: responses()});
  const owner = await f.admin.connect(); await owner.query("BEGIN");
  try {
    const assignment = f.seed.studies[0].attempts[0].assignment_id;
    await owner.query("UPDATE pedpsy.assignments SET status='closed' WHERE id=$1", [assignment]);
    const pending = f.service.complete(f.context, f.attemptId, {expected_revision: saved.revision});
    const assertion = assert.rejects(pending, e => e.code === "NOT_AVAILABLE");
    await waitForBlockedRuntime(f); await owner.query("COMMIT"); await assertion; assert.equal(await f.resultCount(), 0);
    assert.equal((await f.admin.query("SELECT status FROM pedpsy.attempts WHERE id=$1", [f.attemptId])).rows[0].status, "draft");
  } finally {await owner.query("ROLLBACK"); owner.release();}
});
scenario("winning save and losing complete on same revision do not create stale result", async f => {
  const before = await f.service.read(f.context, f.attemptId);
  const saved = await f.service.save(f.context, f.attemptId, {expected_revision: before.revision, current_item_id: "q30", responses: responses()});
  let entered, release; const barrier = new Promise(resolve => {entered = resolve;}); const wait = new Promise(resolve => {release = resolve;});
  const saving = f.uow.run(f.context, async ports => {
    await ports.attempts.compareAndSave(f.attemptId, {expected_revision: saved.revision, current_item_id: "q08", responses: responses().slice(0, 3)});
    await ports.audit.appendRequired({event: "draft_saved", resourceId: f.attemptId}); entered(); await wait;
  });
  await barrier;
  const completing = f.service.complete(f.context, f.attemptId, {expected_revision: saved.revision});
  const assertion = assert.rejects(completing, e => e.code === "REVISION_CONFLICT");
  try {await waitForBlockedRuntime(f);} finally {release();}
  await saving; await assertion; assert.equal(await f.resultCount(), 0);
});
scenario("scorer failure or changed handler rolls back result/completed", async f => {
  const before = await f.service.read(f.context, f.attemptId);
  const saved = await f.service.save(f.context, f.attemptId, {expected_revision: before.revision, current_item_id: "q30", responses: responses()});
  for (const score of [() => {throw new Error("synthetic failure");}, values => ({...scoreTki(values), handler_version: "unsupported"})]) {
    const service = createParticipationService(f.uow, {...f.dependencies, score});
    await assert.rejects(service.complete(f.context, f.attemptId, {expected_revision: saved.revision}));
    assert.equal(await f.resultCount(), 0); assert.deepEqual(await f.service.read(f.context, f.attemptId), saved);
  }
});
scenario("rollback and successful transactions return pool without session state", async f => {
  await assert.rejects(f.service.save(f.context, f.attemptId, {}));
  await f.service.read(f.context, f.attemptId);
  const a = await f.runtime.connect(), b = await f.runtime.connect();
  try {
    assert.equal((await a.query("SELECT * FROM pedpsy.attempts")).rowCount, 0);
    assert.equal((await b.query("SELECT * FROM pedpsy.attempts")).rowCount, 0);
  } finally {a.release(); b.release();}
});
