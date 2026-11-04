'use strict';
// Explicit offline import of the approved-library drafts and releases into the local
// synthetic stand. It creates no accounts, sessions or real research data, and it
// refuses to finish unless the draft verifies against its pinned handler and the
// release allowlist accepts the release that was just written.
const fs = require('node:fs');
const path = require('node:path');
const {randomUUID} = require('node:crypto');
const {Pool} = require('pg');
const {validateConfig} = require('./local-demo.js');
const {approvedV1Releases} = require('../storage/approved-v1-release.js');
const {prepareMethodDraft} = require('../dist/src/application/method-library.js');
const {ScopedMemoryMethodArtifacts} = require('../dist/src/adapters/memory/method-artifacts.js');
const {methodPackageHasher} = require('../dist/src/adapters/method-package-crypto.js');
const {pinnedApprovedHandler} = require('../dist/src/adapters/pinned-approved-handler.js');
const {methodDraftSqlInput} = require('../dist/src/adapters/postgres/method-library.js');

function materialsFor(release) {
  const folder = path.join(path.resolve(__dirname, '..'), 'methods', 'approved', 'v1', 'releases', release.id);
  const pkg = JSON.parse(fs.readFileSync(path.join(folder, 'package-local.json'), 'utf8'));
  const contents = pkg.artifacts.map(artifact => ({
    id: artifact.id, path: artifact.path, bytes: fs.readFileSync(path.join(folder, artifact.path))}));
  return {pkg, contents};
}

async function importApprovedV1Local(client) {
  const {releases} = approvedV1Releases();
  await client.query('SELECT pg_advisory_xact_lock(5151980034)');
  const ids = [];
  for (const release of releases) {
    const {pkg, contents} = materialsFor(release);
    const prepared = await prepareMethodDraft(JSON.stringify(pkg),
      new ScopedMemoryMethodArtifacts(pkg.method_id, pkg.package_version, contents),
      methodPackageHasher(), pinnedApprovedHandler());
    if (prepared.verification.handler.state !== 'pinned' || prepared.verification.publishable !== false) {
      throw new Error('APPROVED_DRAFT_VERIFICATION_REQUIRED');
    }
    const head = (await client.query('SELECT revision FROM pedpsy.method_library_heads WHERE method_id=$1', [pkg.method_id])).rows[0];
    await client.query('SELECT pedpsy.append_method_library_draft($1,$2,$3,$4::jsonb,$5::jsonb)',
      [head ? head.revision : 0, ...methodDraftSqlInput(prepared)]);

    let row = (await client.query('SELECT id FROM pedpsy.instrument_releases WHERE method_version_id=$1 AND handler_version=$2',
      [release.methodVersionId, release.handlerVersion])).rows[0];
    if (!row) {
      const id = randomUUID();
      await client.query("INSERT INTO pedpsy.instrument_releases(id,method_id,form_id,form_version,method_version_id,handler_version,contract_version,form_digest,key_digest,verification_state,publication_state,artifact_ref,form_snapshot) VALUES($1,$2,$3,$4,$5,$6,'1.0',$7,$8,'legacy_checked','draft',$9,$10::jsonb)",
        [id, release.id, release.form.id, release.form.version, release.methodVersionId, release.handlerVersion,
          release.formDigest, release.keyDigest, 'repo:methods/approved/v1/releases/' + release.id, release.formSnapshot]);
      for (const item of release.form.items) {
        await client.query('INSERT INTO pedpsy.release_items VALUES($1,$2,$3,$4::jsonb)', [id, item.id, item.number, JSON.stringify(item.options)]);
      }
      row = {id};
    } else {
      const count = (await client.query('SELECT count(*)::int AS n FROM pedpsy.release_items WHERE release_id=$1', [row.id])).rows[0].n;
      if (count !== release.itemCount) throw new Error('APPROVED_RELEASE_CHANGED');
    }
    const authors = pkg.provenance && Array.isArray(pkg.provenance.sources) ? [pkg.provenance.sources[0].citation] : [];
    await client.query('INSERT INTO pedpsy.method_library_catalog VALUES($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7::jsonb) ON CONFLICT(release_id) DO NOTHING',
      [row.id, release.id, pkg.package_version, release.title, JSON.stringify(authors), JSON.stringify(release.outputs), JSON.stringify([release.title])]);
    const allowed = (await client.query('SELECT pedpsy.constructor_release_allowed($1) allowed', [row.id])).rows[0].allowed;
    if (!allowed) throw new Error('APPROVED_RELEASE_NOT_ALLOWED');
    ids.push(row.id);
  }
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
  const known = /^[A-Z_]+$/.test(error.message);
  console.error('Approved import stopped:', known ? error.message : 'CHECK_LOCAL_PACKAGE');
  if (!known) console.error(String(error.message).slice(0, 300));
  process.exitCode = 1;
});
module.exports = {importApprovedV1Local, materialsFor};
