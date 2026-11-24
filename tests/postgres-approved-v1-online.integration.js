'use strict';
// End-to-end proof for the approved-library releases inside PostgreSQL.
const {test} = require('node:test'), assert = require('node:assert/strict'), {randomUUID} = require('node:crypto');
const fs = require('node:fs'), path = require('node:path');
const {postgresFixture} = require('./postgres-fixture.js'), {verifiedStaff} = require('./mfa-fixture.js'),
  {studyResearcher} = require('./study-fixture.js'), {workspaceFixture, headers} = require('./workspace-fixture.js'),
  {csrfFor} = require('../storage/access.js');
const {PostgresResearchWorkbench} = require('../dist/src/adapters/postgres/research-workbench.js');
const {importApprovedV1Local, OWNER_CORRECTIONS} = require('../scripts/import-approved-v1-local.js');
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
    // The catalog must show the adaptation author, not the provenance service citation.
    for (const id of ["maia_r_32", "ffmq_39", "shpana_20", "ecv_15", "darr_7"]) {
      const authors = (await client.query("SELECT authors FROM pedpsy.method_library_catalog WHERE method_id=$1", [id])).rows[0].authors;
      assert.ok(Array.isArray(authors) && authors.length, "catalog authors for " + id);
      assert.doesNotMatch(JSON.stringify(authors), /Issue #69/, "no service citation as author for " + id);
    }
    // The owner-approved MAIA-R wording is a presentation correction; the pinned
    // form and key are not rewritten.
    const wording = (await client.query("SELECT c.instruction FROM pedpsy.release_presentation_corrections c JOIN pedpsy.instrument_releases r ON r.id=c.release_id WHERE r.method_id='maia_r_32' ORDER BY c.created_at_ms DESC,c.id DESC LIMIT 1")).rows[0];
    assert.equal(wording.instruction, OWNER_CORRECTIONS.maia_r_32.instruction);
    await client.query('COMMIT');
  } finally { client.release(); }
  const {releases} = approvedV1Releases();
  assert.equal(ids.length, releases.length);
  const staff = await verifiedStaff(f), researcher = await studyResearcher(f, staff), store = new PostgresResearchWorkbench(f.runtime);
  let design = await researcher.studies.create(researcher.session.token, 'Synthetic approved library');
  design = await store.change(researcher.session.token, design.id, design.version, 'assign', {all: true, release_ids: [...ids]});
  assert.equal(design.assignments.length, ids.length);
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
    if (release.id === 'motkov_psychological_culture_18') {
      assert.equal(result.presentation.groups.length, 6, 'Motkov keeps six factor pairs');
      assert.equal(result.presentation.summary.measures.length, 2, 'Motkov keeps general A/B');
      assert.ok(['низкий', 'средний', 'высокий', 'псевдовысокий'].includes(result.presentation.summary.level.value));
      assert.ok(result.classifications.some(entry => entry.code === 'gpk – уровень'), 'general harmony level is projected');
    }
    if (release.id === 'ryff_pwb_84_shevelenkova_fesenko') {
      assert.equal(result.presentation.groups[0].measures.length, 6, 'Ryff keeps six profile scales');
      assert.equal(result.presentation.summary.colors, 3, 'Ryff total has three levels');
    }
    if (release.id === 'maia_r_32') {
      const stored = (await f.admin.query('SELECT value FROM pedpsy.responses WHERE study_id=$1 AND attempt_id=$2', [f.studyId, attempt])).rows.map(row => row.value);
      assert.equal(stored.length, 32);
      assert.ok(stored.every(value => /^[0-5]$/.test(value)), 'MAIA-R stores reconciled 0..5 codes');
      assert.ok(stored.includes('0'), 'zero is a stored answer');
    }
    if (release.id === 'uvlk_shipilov') {
      assert.equal(result.presentation.groups[0].measures.length, 3, 'Shipilov keeps three spheres');
      assert.equal(result.presentation.groups[1].measures.length, 6, 'Shipilov keeps six conflicts');
      assert.equal(result.presentation.summary.colors, 5, 'Shipilov total has five levels');
    }
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

  // Existing studies retain MAIA-R 1.0.0 (1..6). Form verification and the
  // runtime must both resolve that pinned release after 1.0.1 becomes current.
  const historical = require('../storage/maia-legacy-release.js').maiaLegacyRelease();
  const historicalRelease = randomUUID(), historicalAssignment = randomUUID(), historicalAttempt = randomUUID();
  await f.admin.query("INSERT INTO pedpsy.instrument_releases(id,method_id,form_id,form_version,method_version_id,handler_version,contract_version,form_digest,key_digest,verification_state,publication_state,artifact_ref,form_snapshot) VALUES($1,'maia_r_32',$2,$3,$4,$5,'1.0',$6,$7,'legacy_checked','draft','repo:methods/approved/v1/legacy/maia_r_32_1_0',$8::jsonb)",
    [historicalRelease, historical.form.id, historical.form.version, historical.methodVersionId, historical.handlerVersion, historical.formDigest, historical.keyDigest, historical.formSnapshot]);
  for (const item of historical.form.items) await f.admin.query('INSERT INTO pedpsy.release_items VALUES($1,$2,$3,$4::jsonb)',
    [historicalRelease, item.id, item.number, JSON.stringify(item.options)]);
  await f.admin.query('INSERT INTO pedpsy.assignments(id,study_id,group_id,stage_id,release_id) VALUES($1,$2,$3,$4,$5)',
    [historicalAssignment, f.studyId, group.id, stage.id, historicalRelease]);
  await f.admin.query("INSERT INTO pedpsy.attempts(id,study_id,enrollment_id,assignment_id,group_id,stage_id,release_id,current_item_id) VALUES($1,$2,$3,$4,$5,$6,$7,'q01')",
    [historicalAttempt, f.studyId, enrollment.id, historicalAssignment, group.id, stage.id, historicalRelease]);
  const historicalBase = '/api/v2/participant/attempts/' + historicalAttempt;
  const historicalForm = await w.app.inject({url: historicalBase + '/form', headers: participantHeaders});
  assert.equal(historicalForm.statusCode, 200);
  assert.deepEqual(historicalForm.json().items[0].options.map(option => String(option.value)), ['1','2','3','4','5','6']);
  const historicalAnswers = historical.form.items.map(item => ({item_id: item.id, value: '2'}));
  const historicalSave = await w.app.inject({method: 'PUT', url: historicalBase + '/draft', headers: participantHeaders,
    payload: {expected_revision: 0, current_item_id: 'q32', responses: historicalAnswers}});
  assert.equal(historicalSave.statusCode, 200, JSON.stringify(historicalSave.json()));
  const historicalComplete = await w.app.inject({method: 'POST', url: historicalBase + '/complete', headers: participantHeaders, payload: {expected_revision: 1}});
  assert.equal(historicalComplete.statusCode, 200, JSON.stringify(historicalComplete.json()));
  assert.deepEqual(historicalComplete.json().measures.map(measure => measure.value), [1,4,3,1,1,1,1,1]);
  const historicalStored = (await f.admin.query('SELECT payload FROM pedpsy.attempt_results WHERE study_id=$1 AND attempt_id=$2', [f.studyId, historicalAttempt])).rows;
  assert.equal(historicalStored.length, 1);
  assert.equal(historicalStored[0].payload.method_version_id, historical.methodVersionId);
  assert.equal(historicalStored[0].payload.calculation.key_digest, historical.keyDigest);
  const historicalRepeat = await w.app.inject({method: 'POST', url: historicalBase + '/complete', headers: participantHeaders, payload: {expected_revision: 0}});
  assert.equal(historicalRepeat.statusCode, 200);
  assert.deepEqual(historicalRepeat.json(), historicalComplete.json());
  const historicalRead = await w.app.inject({url: historicalBase + '/result', headers: participantHeaders});
  assert.equal(historicalRead.statusCode, 200);
  assert.deepEqual(historicalRead.json(), historicalComplete.json());
  assert.deepEqual((await f.admin.query('SELECT payload FROM pedpsy.attempt_results WHERE study_id=$1 AND attempt_id=$2', [f.studyId, historicalAttempt])).rows, historicalStored, 'repeated completion preserves the stored historical result');
  const historicalResponses = (await f.admin.query('SELECT item_id,value FROM pedpsy.responses WHERE study_id=$1 AND attempt_id=$2 ORDER BY item_id', [f.studyId, historicalAttempt])).rows;
  assert.deepEqual(historicalResponses, historicalAnswers, 'historical answer codes remain unchanged');

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