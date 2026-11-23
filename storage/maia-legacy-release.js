'use strict';
// Historical MAIA-R 1.0.0 release. It used answer codes 1..6 and an answerMap to
// score on 0..5. The release stays in PostgreSQL for existing studies and results;
// this read-only definition lets the runtime verify and show those rows after the
// reconciled 1.0.1 release became current.
const fs = require('node:fs');
const path = require('node:path');
const {createHash} = require('node:crypto');
const {canonicalJson} = require('./releases.js');

const directory = path.join(__dirname, '..', 'methods', 'approved', 'v1', 'legacy', 'maia_r_32_1_0');
const form = JSON.parse(fs.readFileSync(path.join(directory, 'form.json'), 'utf8'));
const key = JSON.parse(fs.readFileSync(path.join(directory, 'key.json'), 'utf8'));
const sha = value => 'sha256:' + createHash('sha256').update(value).digest('hex');
const formSnapshot = canonicalJson(form);
const formDigest = sha(formSnapshot);
const keyDigest = sha(JSON.stringify(key));
const expectedFormDigest = 'sha256:6be4b316d9c6738e26f32c38ebca2fc54b9467621901f9771a7e4faa29bd835b';
const expectedKeyDigest = 'sha256:10d1e33e0ee34a3c61a2e33e89063b6ca0ddf341d266748c6b9fcb96a6a8043f';
if (formDigest !== expectedFormDigest || keyDigest !== expectedKeyDigest) {
  throw new Error('MAIA_LEGACY_RELEASE_DIGEST_MISMATCH');
}

const release = Object.freeze({
  methodVersionId: 'maia_r_32@1.0.0-staging',
  handlerVersion: 'approved-numeric-1.0.0',
  verificationState: 'legacy_checked',
  form,
  formSnapshot,
  formDigest,
  keyDigest,
  key
});

module.exports = {maiaLegacyRelease: () => release};
