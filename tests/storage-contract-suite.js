"use strict";
const {test} = require("node:test");
const assert = require("node:assert/strict");
const responses = () => Array.from({length: 30}, (_, i) => ({item_id: "q" + String(i + 1).padStart(2, "0"), value: i % 2 ? "B" : "A"}));
const code = expected => error => error.code === expected;
function registerStorageContracts(name, createFixture) {
  const scenario = (title, body) => test(name + " contract: " + title, async t => {
    const f = await createFixture(); t.after(() => f.close()); await body(f);
  });
  scenario("own snapshot, save and current slide restore", async f => {
    const before = await f.service.read(f.context, f.attemptId);
    const saved = await f.service.save(f.context, f.attemptId, {expected_revision: before.revision, current_item_id: "q08", responses: responses().slice(0, 3)});
    assert.equal(saved.revision, before.revision + 1); assert.equal(saved.currentItemId, "q08");
    assert.deepEqual(saved, await f.service.read(f.context, f.attemptId));
  });
  scenario("same-study foreign, cross-study and missing IDs have identical denial", async f => {
    for (const id of [f.foreignId, f.crossStudyId, "00000000-0000-4000-8000-000000000000"]) {
      await assert.rejects(f.service.read(f.context, id), code("NOT_AVAILABLE"));
      await assert.rejects(f.service.save(f.context, id, {}), code("NOT_AVAILABLE"));
      await assert.rejects(f.service.complete(f.context, id, {expected_revision: 0}), code("NOT_AVAILABLE"));
    }
  });
  scenario("forged context or staff realm is not authority", async f => {
    for (const context of [{...f.context}, {...f.context, realm: "staff"}, {...f.context, participantId: "forged"}]) {
      await assert.rejects(f.service.read(context, f.attemptId), code("AUTH_REQUIRED"));
    }
  });
  scenario("two saves with one revision have one winner", async f => {
    const before = await f.service.read(f.context, f.attemptId);
    const input = {expected_revision: before.revision, current_item_id: "q08", responses: responses().slice(0, 3)};
    const results = await Promise.allSettled([f.service.save(f.context, f.attemptId, input), f.service.save(f.context, f.attemptId, {...input, current_item_id: "q09"})]);
    assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
    assert.equal(results.find(r => r.status === "rejected").reason.code, "REVISION_CONFLICT");
    assert.equal((await f.service.read(f.context, f.attemptId)).revision, before.revision + 1);
  });
  scenario("strict invalid snapshots leave state unchanged", async f => {
    const before = await f.service.read(f.context, f.attemptId);
    const valid = {expected_revision: before.revision, current_item_id: "q01", responses: responses()};
    for (const input of [{...valid, role: "superadministrator"}, {...valid, expected_revision: -1}, {...valid, current_item_id: "q31"},
      {...valid, responses: [{item_id: "q01", value: "А"}]}, {...valid, responses: [responses()[0], responses()[0]]}, {...valid, responses: [{item_id: "q31", value: "A"}]}]) {
      await assert.rejects(f.service.save(f.context, f.attemptId, input), code("INVALID_DRAFT"));
      assert.deepEqual(await f.service.read(f.context, f.attemptId), before);
    }
  });
  scenario("incomplete result is not ready and complete creates no result", async f => {
    const before = await f.service.read(f.context, f.attemptId);
    await assert.rejects(f.service.result(f.context, f.attemptId), code("RESULT_NOT_READY"));
    await assert.rejects(f.service.complete(f.context, f.attemptId, {expected_revision: before.revision}), code("INCOMPLETE_RESPONSES"));
    assert.deepEqual(await f.service.read(f.context, f.attemptId), before); assert.equal(await f.resultCount(), 0);
  });
  scenario("full completion preserves original scores/digest and is idempotent", async f => {
    const before = await f.service.read(f.context, f.attemptId);
    const saved = await f.service.save(f.context, f.attemptId, {expected_revision: before.revision, current_item_id: "q30", responses: responses()});
    const result = await f.service.complete(f.context, f.attemptId, {expected_revision: saved.revision});
    assert.deepEqual(result.payload, f.originalScore(responses())); assert.equal(result.responsesDigest, f.originalDigest(responses()));
    assert.equal(result.inputRevision, saved.revision); assert.equal((await f.service.read(f.context, f.attemptId)).revision, saved.revision + 1);
    assert.deepEqual(await f.service.complete(f.context, f.attemptId, {expected_revision: saved.revision}), result);
    assert.deepEqual(await f.service.result(f.context, f.attemptId), result); assert.equal(await f.resultCount(), 1);
    await assert.rejects(f.service.save(f.context, f.attemptId, {expected_revision: saved.revision + 1, current_item_id: "q01", responses: []}), code("ATTEMPT_COMPLETED"));
  });
  scenario("two concurrent completes return exactly one stored result", async f => {
    const before = await f.service.read(f.context, f.attemptId);
    const saved = await f.service.save(f.context, f.attemptId, {expected_revision: before.revision, current_item_id: "q30", responses: responses()});
    const [a, b] = await Promise.all([f.service.complete(f.context, f.attemptId, {expected_revision: saved.revision}), f.service.complete(f.context, f.attemptId, {expected_revision: saved.revision})]);
    assert.deepEqual(a, b); assert.equal(await f.resultCount(), 1);
  });
  scenario("revocation invalidates an already-created context", async f => {
    await f.revoke(); await assert.rejects(f.service.read(f.context, f.attemptId), code("AUTH_REQUIRED"));
    await assert.rejects(f.service.save(f.context, f.attemptId, {}), code("AUTH_REQUIRED"));
  });
  scenario("closed assignment invalidates existing context", async f => {
    await f.closeAssignment(); await assert.rejects(f.service.read(f.context, f.attemptId), code("NOT_AVAILABLE"));
  });
  scenario("mandatory audit failure rolls back both snapshot and revision", async f => {
    const before = await f.service.read(f.context, f.attemptId); await f.failAudit(true);
    await assert.rejects(f.service.save(f.context, f.attemptId, {expected_revision: before.revision, current_item_id: "q08", responses: responses()}));
    await f.failAudit(false); assert.deepEqual(await f.service.read(f.context, f.attemptId), before);
  });
  scenario("audit failure after scoring rolls back result and completed", async f => {
    const before = await f.service.read(f.context, f.attemptId);
    const saved = await f.service.save(f.context, f.attemptId, {expected_revision: before.revision, current_item_id: "q30", responses: responses()});
    await f.failAudit(true); await assert.rejects(f.service.complete(f.context, f.attemptId, {expected_revision: saved.revision}));
    await f.failAudit(false); assert.deepEqual(await f.service.read(f.context, f.attemptId), saved); assert.equal(await f.resultCount(), 0);
  });
}
module.exports = {registerStorageContracts, responses};
