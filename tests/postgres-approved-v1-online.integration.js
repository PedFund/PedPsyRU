'use strict';
// End-to-end proof for the approved-library releases inside PostgreSQL.
const {test} = require('node:test'), assert = require('node:assert/strict'), {randomUUID} = require('node:crypto');
const fs = require('node:fs'), path = require('node:path');
const {postgresFixture} = require('./postgres-fixture.js'), {verifiedStaff} = require('./mfa-fixture.js'),
  {studyResearcher} = require('./study-fixture.js'), {workspaceFixture, headers} = require('./workspace-fixture.js'),
  {csrfFor} = require('../storage/access.js');
const {PostgresResearchWorkbench} = require('../dist/src/adapters/postgres/research-workbench.js');
const {importApprovedV1Local} = require('../scripts/import-approved-v1-local.js');
const {approvedV1Releases} = require('../storage/approved-v1-release.js');

test('PostgreSQL approved releases: idempotent import, assignment, pinned form, draft, completion and scoring', async t => {
  const f = await postgresFixture({runtimePoolSize: 3});
  t.after(() => f.close());
  const client = await f.admin.connect();
  let ids;
  try {
    await client.query('BEGIN');
    ids = await importApprovedV1Local(client);
    assert.deepEqual(await importApprovedV1Local(client), ids);
    await client.query('COMMIT');
  } finally { client.release(); }
  const {releases} = approvedV1Releases();
  assert.equal(ids.length, releases.length);
  const staff = await verifiedStaff(f), researcher = await studyResearcher(f, staff), store = new PostgresResearchWorkbench(f.runtime);
  let design = await researcher.studies.create(researcher.session.token, 'Synthetic approved library');
  design = await store.change(researcher.session.token, design.id, design.version, 'assign', {all: true, release_ids: [f.seed.release_id, ...ids]});
  assert.equal(design.assignments.length, ids.length + 1);
  const w = workspaceFixture(f, undefined, {workbench: true, library: true});
  t.after(() => w.app.close());
  const researchHeaders = {...headers, cookie: 'pedpsy_researcher_demo=' + researcher.session.token, 'x-pedpsy-csrf': csrfFor(researcher.session.token)};
  const catalog = await w.app.inject({url: '/api/v2/researcher/methods?q=' + encodeURIComponent('Рефлексивность'), headers: researchHeaders});
  assert.equal(catalog.statusCode, 200);
  assert.equal(catalog.json()[0].method_id, 'reflexivity_karpov_27');
  const group = f.seed.studies[0].groups[0], stage = f.seed.studies[0].stages[0], participant = f.participant;
  const enrollment = (await f.admin.query('SELECT id FROM pedpsy.stage_enrollments WHERE study_id=$1 AND participant_id=$2 AND group_id=$3 AND stage_id=$4',
    [f.studyId, participant.id, group.id, stage.id])).rows[0];
  const participantHeaders = {...headers, cookie: 'pedpsy_v2_demo=' + f.raw, 'x-pedpsy-csrf': csrfFor(f.raw)};
  let firstBase, firstResult;
  for (const [index, release] of releases.entries()) {
    const assignment = randomUUID(), attempt = randomUUID();
    await f.admin.query('INSERT INTO pedpsy.assignments(id,study_id,group_id,stage_id,release_id) VALUES($1,$2,$3,$4,$5)',
      [assignment, f.studyId, group.id, stage.id, ids[index]]);
    await f.admin.query("INSERT INTO pedpsy.attempts(id,study_id,enrollment_id,assignment_id,group_id,stage_id,release_id,current_item_id) VALUES($1,$2,$3,$4,$5,$6,$7,'q01')",
      [attempt, f.studyId, enrollment.id, assignment, group.id, stage.id, ids[index]]);
    const base = '/api/v2/participant/attempts/' + attempt;
    if (index === 0) firstBase = base;
    const formResponse = await w.app.inject({url: base + '/form', headers: participantHeaders});
    assert.equal(formResponse.statusCode, 200, release.id);
    const form = formResponse.json();
    assert.equal(form.items.length, release.itemCount, release.id);
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'methods', 'approved', 'v1', 'releases', release.id, 'package-local.json'), 'utf8'));
    const vector = pkg.control_vectors[0];
    const answers = form.items.map((item, itemIndex) => ({item_id: item.id, value: String(vector.responses[itemIndex].value)}));
    const save = await w.app.inject({method: 'PUT', url: base + '/draft', headers: participantHeaders,
      payload: {expected_revision: 0, current_item_id: form.items.at(-1).id, responses: answers}});
    assert.equal(save.statusCode, 200, release.id + ' ' + JSON.stringify(save.json()));
    const complete = await w.app.inject({method: 'POST', url: base + '/complete', headers: participantHeaders, payload: {expected_revision: 1}});
    assert.equal(complete.statusCode, 200, release.id + ' ' + JSON.stringify(complete.json()));
    const result = complete.json();
    if (index === 0) firstResult = result;
    // Measure labels are localised; compare by the language-independent scale id.
    // Both lists follow the key's scale order: compare the values positionally, so the
    // assertion does not depend on localisation of labels or scale ids.
    const expected = vector.expected.map(entry => entry.value);
    const measured = result.measures.filter(measure => measure.representation === 'raw').map(measure => measure.value);
    assert.deepEqual(measured, expected, release.id);
    assert.equal(JSON.stringify(result).includes('key_digest'), false, release.id);
    assert.deepEqual((await w.app.inject({url: base + '/result', headers: participantHeaders})).json(), result, release.id);
  }

  // Negative and idempotent cases on the attempt completed in the first iteration.
  assert.ok(firstBase, 'the first release must have produced an attempt');
  const reopen = await w.app.inject({method: 'PUT', url: firstBase + '/draft', headers: participantHeaders,
    payload: {expected_revision: 2, current_item_id: 'q01', responses: []}});
  assert.ok(reopen.statusCode >= 400, 'a completed attempt must not accept a new draft, got ' + reopen.statusCode);
  const repeat = await w.app.inject({method: 'POST', url: firstBase + '/complete', headers: participantHeaders, payload: {expected_revision: 1}});
  assert.equal(repeat.statusCode, 200, 'repeating completion must be idempotent');
  assert.deepEqual(repeat.json(), firstResult, 'repeated completion returns the stored result');
  const anonymous = await w.app.inject({url: firstBase + '/form', headers});
  assert.ok(anonymous.statusCode >= 400, 'anonymous access must be refused, got ' + anonymous.statusCode);
});