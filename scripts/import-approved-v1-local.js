'use strict';
// Explicit offline import of the approved-library releases into the local synthetic
// stand. It creates no accounts, sessions or real research data, and it refuses to
// finish if the pinned allowlist does not accept the release it just wrote.
const fs = require('node:fs');
const path = require('node:path');
const {randomUUID} = require('node:crypto');
const {Pool} = require('pg');
const {validateConfig} = require('./local-demo.js');
const {approvedV1Releases} = require('../storage/approved-v1-release.js');
const {entries} = require('../core/approved-v1-data.js');

async function importApprovedV1Local(client) {
  const {releases} = approvedV1Releases();
  const packages = new Map(entries.map(entry => [entry.id, entry]));
  await client.query('SELECT pg_advisory_xact_lock(5151980034)');
  const ids = [], skipped = [];
  for (const release of releases) {
    const source = packages.get(release.id);
    if (!source) throw new Error('APPROVED_SOURCE_MISSING:' + release.id);
    let row = (await client.query('SELECT id FROM pedpsy.instrument_releases WHERE method_version_id=$1 AND handler_version=$2',
      [release.methodVersionId, release.handlerVersion])).rows[0];
    if (!row) {
      const id = randomUUID();
      await client.query("INSERT INTO pedpsy.instrument_releases(id,method_id,form_id,form_version,method_version_id,handler_version,contract_version,form_digest,key_digest,verification_state,publication_state,artifact_ref,form_snapshot) VALUES($1,$2,$3,$4,$5,$6,'1.0',$7,$8,'legacy_checked','draft',$9,$10::jsonb)",
        [id, release.id, release.form.id, release.form.version, release.methodVersionId, release.handlerVersion,
          release.formDigest, release.keyDigest, 'repo:methods/approved/v1/' + release.id, release.formSnapshot]);
      for (const item of release.form.items) {
        await client.query('INSERT INTO pedpsy.release_items VALUES($1,$2,$3,$4::jsonb)', [id, item.id, item.number, JSON.stringify(item.options)]);
      }
      row = {id};
    } else {
      const count = (await client.query('SELECT count(*)::int AS n FROM pedpsy.release_items WHERE release_id=$1', [row.id])).rows[0].n;
      if (count !== release.itemCount) throw new Error('APPROVED_RELEASE_CHANGED:' + release.id);
    }
    // The catalogue references method_library_versions, which only the draft pipeline
    // creates. Without that row the release is still pinned and allowed, but it is not
    // advertised to researchers; the import says so instead of faking a draft.
    const library = await client.query('SELECT 1 FROM pedpsy.method_library_versions WHERE method_id=$1 AND package_version=$2',
      [release.id, source.version]);
    if (library.rowCount) {
      await client.query('INSERT INTO pedpsy.method_library_catalog VALUES($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7::jsonb) ON CONFLICT(release_id) DO NOTHING',
        [row.id, release.id, source.version, release.title, JSON.stringify(source.authors), JSON.stringify(release.outputs), JSON.stringify(source.search)]);
    } else {
      skipped.push(release.id);
    }
    const allowed = (await client.query('SELECT pedpsy.constructor_release_allowed($1) allowed', [row.id])).rows[0].allowed;
    if (!allowed) throw new Error('APPROVED_RELEASE_NOT_ALLOWED:' + release.id);
    ids.push(row.id);
  }
  if (skipped.length) console.log('Releases pinned without catalogue rows: ' + skipped.join(', '));
  return ids;
}

async function main() {
  const root = path.resolve(__dirname, '..');
  const owner = validateConfig(JSON.parse(fs.readFileSync(path.join(root, '.local/demo-stand/owner.json'), 'utf8')), 'owner');
  const pool = new Pool({...owner, max: 1, ssl: false}), client = await pool.connect();
  try {
    await client.query('BEGIN');
    const ids = await importApprovedV1Local(client);
    await client.query('COMMIT');
    console.log('Pinned approved-library releases imported: ' + ids.length);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

if (require.main === module) main().catch(error => {
  console.error('Approved import stopped:', /^[A-Z_]+$/.test(error.message) ? error.message : 'CHECK_LOCAL_PACKAGE');
  process.exitCode = 1;
});
module.exports = {importApprovedV1Local};
