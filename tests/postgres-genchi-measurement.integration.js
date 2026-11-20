'use strict';
// End-to-end Genchi measurement through the ordinary attempt protocol: assignment,
// numeric screen payload, completion, rating and idempotent repeat.
const {test} = require('node:test'), assert = require('node:assert/strict'), {randomUUID} = require('node:crypto');
const {postgresFixture} = require('./postgres-fixture.js'), {workspaceFixture, headers} = require('./workspace-fixture.js');
const {importGenchiLocal} = require('../scripts/import-genchi-local.js');
const {csrfFor} = require('../storage/access.js');
test('PostgreSQL Genchi: assigned measurement completes into seconds and a sex rating', async t => {
  const f = await postgresFixture({runtimePoolSize: 3}); t.after(() => f.close());
  const imported = await importGenchiLocal(f.admin);
  const release = (await f.admin.query("SELECT id FROM pedpsy.instrument_releases WHERE method_id='genchi_breath_hold'")).rows[0];
  assert.equal(release.id, imported);
  assert.ok(release, 'the release is imported by import-genchi-local');
  assert.deepEqual(await importGenchiLocal(f.admin), imported, 'the import is idempotent');
  assert.equal((await f.admin.query('SELECT pedpsy.constructor_release_allowed($1) allowed', [release.id])).rows[0].allowed, true);
  const group = f.seed.studies[0].groups[0], stage = f.seed.studies[0].stages[0], participant = f.participant;
  const enrollment = (await f.admin.query('SELECT id FROM pedpsy.stage_enrollments WHERE study_id=$1 AND participant_id=$2 AND group_id=$3 AND stage_id=$4',
    [f.studyId, participant.id, group.id, stage.id])).rows[0];
  const assignment = randomUUID(), attempt = randomUUID();
  await f.admin.query('INSERT INTO pedpsy.assignments(id,study_id,group_id,stage_id,release_id) VALUES($1,$2,$3,$4,$5)',
    [assignment, f.studyId, group.id, stage.id, release.id]);
  await f.admin.query("INSERT INTO pedpsy.attempts(id,study_id,enrollment_id,assignment_id,group_id,stage_id,release_id,current_item_id) VALUES($1,$2,$3,$4,$5,$6,$7,'q01')",
    [attempt, f.studyId, enrollment.id, assignment, group.id, stage.id, release.id]);
  const w = workspaceFixture(f, undefined, {workbench: true, library: true}); t.after(() => w.app.close());
  const participantHeaders = {...headers, cookie: 'pedpsy_v2_demo=' + f.raw, 'x-pedpsy-csrf': csrfFor(f.raw)};
  const base = '/api/v2/participant/attempts/' + attempt;
  const form = (await w.app.inject({url: base + '/form', headers: participantHeaders})).json();
  assert.equal(form.presentation.id, 'pedpsy/breath-hold');
  assert.deepEqual(form.items.map(item => item.id), ['q01', 'q02']);
  const save = await w.app.inject({method: 'PUT', url: base + '/draft', headers: participantHeaders,
    payload: {expected_revision: 0, current_item_id: 'q01', responses: [{item_id: 'q01', value: '25'}, {item_id: 'q02', value: '2'}]}});
  assert.equal(save.statusCode, 200, JSON.stringify(save.json()));
  const complete = await w.app.inject({method: 'POST', url: base + '/complete', headers: participantHeaders, payload: {expected_revision: 1}});
  assert.equal(complete.statusCode, 200, JSON.stringify(complete.json()));
  const result = complete.json();
  assert.ok(Array.isArray(result.measures), 'payload has measures: ' + JSON.stringify(result).slice(0, 300));
  assert.equal(result.measures.find(m => m.code === 'duration_seconds').value, 25);
  assert.equal(result.classifications.find(c => c.code === 'rating').value, 'хорошо');
  assert.equal(JSON.stringify(result).includes('male'), false, 'the sex used for the rating is not echoed');
  const repeat = await w.app.inject({method: 'POST', url: base + '/complete', headers: participantHeaders, payload: {expected_revision: 1}});
  assert.equal(repeat.statusCode, 200);
  assert.deepEqual(repeat.json(), result);
  const anonymous = await w.app.inject({url: base + '/form', headers});
  assert.ok(anonymous.statusCode >= 400, 'anonymous access must be refused');
});
test('PostgreSQL Genchi: incomplete payload and out-of-range seconds are refused', async t => {
  const f = await postgresFixture({runtimePoolSize: 3}); t.after(() => f.close());
  await importGenchiLocal(f.admin);
  const release = (await f.admin.query("SELECT id FROM pedpsy.instrument_releases WHERE method_id='genchi_breath_hold'")).rows[0];
  const group = f.seed.studies[0].groups[0], stage = f.seed.studies[0].stages[0], participant = f.participant;
  const enrollment = (await f.admin.query('SELECT id FROM pedpsy.stage_enrollments WHERE study_id=$1 AND participant_id=$2 AND group_id=$3 AND stage_id=$4',
    [f.studyId, participant.id, group.id, stage.id])).rows[0];
  const attempt = randomUUID(), assignment = randomUUID();
  await f.admin.query('INSERT INTO pedpsy.assignments(id,study_id,group_id,stage_id,release_id) VALUES($1,$2,$3,$4,$5)',
    [assignment, f.studyId, group.id, stage.id, release.id]);
  await f.admin.query("INSERT INTO pedpsy.attempts(id,study_id,enrollment_id,assignment_id,group_id,stage_id,release_id,current_item_id) VALUES($1,$2,$3,$4,$5,$6,$7,'q01')",
    [attempt, f.studyId, enrollment.id, assignment, group.id, stage.id, release.id]);
  const w = workspaceFixture(f, undefined, {workbench: true, library: true}); t.after(() => w.app.close());
  const participantHeaders = {...headers, cookie: 'pedpsy_v2_demo=' + f.raw, 'x-pedpsy-csrf': csrfFor(f.raw)};
  const base = '/api/v2/participant/attempts/' + attempt;
  const outOfRange = await w.app.inject({method: 'PUT', url: base + '/draft', headers: participantHeaders,
    payload: {expected_revision: 0, current_item_id: 'q01', responses: [{item_id: 'q01', value: '601'}, {item_id: 'q02', value: '1'}]}});
  assert.ok(outOfRange.statusCode >= 400, '601 seconds is outside the released option set');
  const partial = await w.app.inject({method: 'PUT', url: base + '/draft', headers: participantHeaders,
    payload: {expected_revision: 0, current_item_id: 'q01', responses: [{item_id: 'q01', value: '25'}]}});
  assert.equal(partial.statusCode, 200);
  const incomplete = await w.app.inject({method: 'POST', url: base + '/complete', headers: participantHeaders, payload: {expected_revision: 1}});
  assert.equal(incomplete.statusCode, 422, 'completion without the sex field is refused');
});
