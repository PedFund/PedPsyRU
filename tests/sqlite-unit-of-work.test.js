"use strict";
const {test} = require("node:test");
const assert = require("node:assert/strict");
const {randomUUID} = require("node:crypto");
const {openDatabase, migrate} = require("../storage/database.js");
const {importTkiRelease, responsesDigest} = require("../storage/releases.js");
const {seedTraining} = require("../storage/seed.js");
const {createParticipantAccess, csrfFor} = require("../storage/access.js");
const {createDraftStore} = require("../storage/drafts.js");
const {createCompletionStore} = require("../storage/completion.js");
const {scoreTki, CONTRACT_VERSION, METHOD_VERSION_ID, HANDLER_VERSION} = require("../core/tki-contract.js");
const {SqliteUnitOfWork} = require("../dist/src/adapters/sqlite/unit-of-work.js");
const {createParticipationService} = require("../dist/src/application/participation.js");
const {registerStorageContracts, responses} = require("./storage-contract-suite.js");
async function fixture() {
  const db = openDatabase(); migrate(db); const releaseId = importTkiRelease(db); const seed = seedTraining(db, releaseId);
  const study = seed.studies[0], attempt = study.attempts[0], participant = study.participants[0];
  const access = createParticipantAccess(db); const password = randomUUID() + randomUUID();
  await access.provision({study_id: study.id, participant_id: participant.id, login_id: "SYNTHETIC-CONTRACT", password});
  const session = await access.login({login_id: "SYNTHETIC-CONTRACT", password});
  const uow = new SqliteUnitOfWork(db, access); const context = uow.context(session.token);
  const dependencies = {newId: randomUUID, now: () => new Date().toISOString(), digest: (ids, values) => responsesDigest(ids.map(item_id => ({item_id})), values)};
  const originalScore = values => scoreTki({contract_version: CONTRACT_VERSION, method_version_id: METHOD_VERSION_ID, handler_version: HANDLER_VERSION, responses: values});
  return {db, access, session, uow, context, dependencies, service: createParticipationService(uow, dependencies), attemptId: attempt.id,
    foreignId: study.attempts.find(a => a.participant_id !== participant.id).id, crossStudyId: seed.studies[1].attempts[0].id,
    originalScore, originalDigest: values => dependencies.digest(responses().map(r => r.item_id), values),
    resultCount: () => db.prepare("SELECT count(*) AS n FROM attempt_results").get().n,
    revoke: () => access.revoke("SYNTHETIC-CONTRACT"),
    closeAssignment: () => db.prepare("UPDATE assignments SET status='closed' WHERE id=?").run(attempt.assignment_id),
    failAudit: flag => flag ? db.exec("CREATE TEMP TRIGGER contract_audit_fail BEFORE INSERT ON access_audit_events BEGIN SELECT RAISE(ABORT,'synthetic audit failure'); END") : db.exec("DROP TRIGGER contract_audit_fail"),
    close: () => db.close()};
}
registerStorageContracts("SQLite", fixture);
test("SQLite async ports expire after transaction and nested callback is rejected", async t => {
  const f = await fixture(); t.after(() => f.close()); let leaked;
  await f.uow.run(f.context, async ports => {leaked = ports;
    await assert.rejects(f.uow.run(f.context, async () => {}), /NESTED_TRANSACTION/);
  });
  await assert.rejects(leaked.attempts.getAuthorized(f.attemptId), /TRANSACTION_CLOSED/);
  await assert.rejects(leaked.results.getExisting(f.attemptId), /TRANSACTION_CLOSED/);
});
test("new async SQLite save remains compatible with original completion store", async t => {
  const f = await fixture(); t.after(() => f.close());
  const before = await f.service.read(f.context, f.attemptId);
  const saved = await f.service.save(f.context, f.attemptId, {expected_revision: before.revision, current_item_id: "q30", responses: responses()});
  const old = createCompletionStore(f.db, f.access).complete(f.session.token, f.attemptId, {expected_revision: saved.revision}, csrfFor(f.session.token));
  const result = await f.service.result(f.context, f.attemptId);
  assert.equal(result.id, old.result_id); assert.deepEqual(result.payload, old.result); assert.equal(result.responsesDigest, old.responses_digest);
});
test("original save remains compatible with new async completion and legacy read", async t => {
  const f = await fixture(); t.after(() => f.close());
  const before = await f.service.read(f.context, f.attemptId);
  const saved = createDraftStore(f.db, f.access).save(f.session.token, f.attemptId, {expected_revision: before.revision, current_item_id: "q30", responses: responses()}, csrfFor(f.session.token));
  const result = await f.service.complete(f.context, f.attemptId, {expected_revision: saved.revision});
  const old = createCompletionStore(f.db, f.access).read(f.session.token, f.attemptId);
  assert.equal(result.id, old.result_id); assert.deepEqual(result.payload, old.result);
});
test("throwing or unsupported scorer rolls back new async completion", async t => {
  const f = await fixture(); t.after(() => f.close());
  const before = await f.service.read(f.context, f.attemptId);
  const saved = await f.service.save(f.context, f.attemptId, {expected_revision: before.revision, current_item_id: "q30", responses: responses()});
  for (const score of [() => {throw new Error("synthetic scorer failure");}, values => ({...scoreTki(values), handler_version: "unsupported"})]) {
    const service = createParticipationService(f.uow, {...f.dependencies, score});
    await assert.rejects(service.complete(f.context, f.attemptId, {expected_revision: saved.revision}));
    assert.equal(f.resultCount(), 0); assert.deepEqual(await f.service.read(f.context, f.attemptId), saved);
  }
});
test("SQLite UnitOfWork refuses mutation commit without its mandatory audit", async t => {
  const f = await fixture(); t.after(() => f.close());
  const before = await f.service.read(f.context, f.attemptId);
  await assert.rejects(f.uow.run(f.context, async ports => {
    await ports.attempts.compareAndSave(f.attemptId, {expected_revision: before.revision, current_item_id: "q08", responses: responses()});
  }), /MANDATORY_AUDIT_MISSING/);
  assert.deepEqual(await f.service.read(f.context, f.attemptId), before);
});
