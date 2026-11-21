"use strict";
// Launch acceptance on an isolated PostgreSQL: five participants go from registration
// and password to passport, consent, admission, a completed method, an invalidated
// result with a retry, and a password reset. Synthetic data only.
const {test} = require("node:test"), assert = require("node:assert/strict"), {randomBytes, createHash} = require("node:crypto");
const {postgresFixture} = require("./postgres-fixture.js"), {stageSetup, stageIdentity, selection, prepare} = require("./participant-enrollment-fixture.js");
const hash = value => "sha256:" + createHash("sha256").update(value).digest("hex");
test("Launch acceptance: five participants complete the full participant journey", {timeout: 300000}, async t => {
  const f = await postgresFixture({runtimePoolSize: 4}); t.after(() => f.close());
  const base = await stageSetup(f);
  const release = base.design.assignments[0].release_id;
  const items = (await f.admin.query("SELECT item_id,options FROM pedpsy.release_items WHERE release_id=$1 ORDER BY ordinal", [release])).rows;
  const sessions = [];
  const prepareNoOpen = async x => {
    const p = await x.passports.read(x.session.token);
    const saved = await x.passports.save(x.session.token, {schema_version: p.schema_version, expected_revision: p.revision, values: {sex: "female", age: 30}});
    await x.passports.complete(x.session.token, {schema_version: saved.schema_version, expected_revision: saved.revision});
    const policy = await x.consents.read(x.session.token);
    const participation = policy.documents.find(d => d.purpose === "study_participation");
    await x.consents.accept(x.session.token, {purpose: "study_participation", document_version: participation.version, expected_policy_revision: policy.policy_revision, accept: true});
  };
  for (let i = 1; i <= 5; i++) {
    const x = {...base, ...(await stageIdentity(f, base, `acceptance.${i}@example.test`))};
    await prepareNoOpen(x);
    if (i === 1) await x.access.open(x.r.session.token, x.design.id, x.design.groups[0].id, x.design.stages[0].id, {expected_revision: 0});
    const admitted = await x.enrollment.enroll(x.session.token, selection(x));
    const attempt = admitted.attempts[0];
    const ctx = await x.uow.context(x.session.token);
    const values = items.map(item => ({item_id: item.item_id, value: "A"}));
    const saved = await x.service.save(ctx, attempt.attempt_id, {expected_revision: 0, current_item_id: items[items.length - 1].item_id, responses: values});
    const result = await x.service.complete(ctx, attempt.attempt_id, {expected_revision: saved.revision});
    assert.equal(result.payload.status, "scored");
    sessions.push({x, attempt: attempt.attempt_id, result});
  }
  const rows = await f.admin.query("SELECT count(*)::integer n FROM pedpsy.attempt_results WHERE study_id=$1", [base.design.id]);
  const progress = await f.admin.query("SELECT count(*)::integer n FROM jsonb_array_elements(pedpsy.research_progress_rows($1)) x WHERE x->>'status'='completed'", [base.design.id]);
  const completed = sessions.length;
  const completedRows = await f.admin.query("SELECT count(DISTINCT id)::integer n FROM pedpsy.attempts WHERE study_id=$1 AND status='completed'", [base.design.id]);
  assert.equal(completedRows.rows[0].n, completed);
  assert.equal(rows.rows[0].n, completed);
  assert.ok(progress.rows[0].n >= completed, "progress projection must include the completed participants");
  // Invalidate one result and retry it as a new attempt.
  const first = sessions[0];
  await f.admin.query("INSERT INTO pedpsy.attempt_invalidations(attempt_id,reason,created_at_ms) VALUES($1,'acceptance_check',$2)", [first.attempt, Date.now()]);
  const ctx = await first.x.uow.context(first.x.session.token);
  assert.equal(await first.x.service.invalidated(ctx, first.attempt), true);
  const retried = await first.x.service.retry(ctx, first.attempt);
  assert.match(retried.attempt_id, /^[0-9a-f-]{36}$/);
  const retryRow = (await f.admin.query("SELECT status,attempt_no FROM pedpsy.attempts WHERE id=$1", [retried.attempt_id])).rows[0];
  assert.equal(retryRow.status, "draft"); assert.equal(retryRow.attempt_no, 2);
  // Password reset for the last participant, restored from a known code.
  const last = sessions[4], resetCode = randomBytes(32).toString("base64url");
  const scope = (await f.admin.query("SELECT study_id,participant_id FROM pedpsy.participant_contacts WHERE email_key=$1", ["acceptance.5@example.test"])).rows[0];
  await f.admin.query("INSERT INTO pedpsy.password_resets(id,study_id,participant_id,code_hash,created_at_ms,expires_at_ms,attempts_remaining) VALUES(gen_random_uuid(),$1,$2,$3,$4::bigint,$4::bigint+1800000,5)", [scope.study_id, scope.participant_id, hash(resetCode), Date.now()]);
  assert.deepEqual(await last.x.registration.resetPassword(base.invite.invite_token, {email: "acceptance.5@example.test", code: resetCode, password: "synthetic acceptance password"}, "C".repeat(43), ""), {status: "password_reset"});
  assert.match((await last.x.registration.login({study_id: base.design.id, email: "acceptance.5@example.test", password: "synthetic acceptance password"})).token, /^[A-Za-z0-9_-]{43}$/);
});
