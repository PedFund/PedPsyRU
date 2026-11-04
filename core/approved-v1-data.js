'use strict';
// Declarative approved-library entries: package metadata (form texts) plus the
// generated numeric key. A missing or inconsistent pair is a hard error; nothing
// is inferred and no release is implied by the presence of these files.
const fs = require('node:fs');
const path = require('node:path');
const {createHash} = require('node:crypto');

const directory = path.join(__dirname, '..', 'methods', 'approved', 'v1');
const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'keys', 'manifest.json'), 'utf8'));
const sha = value => 'sha256:' + createHash('sha256').update(value).digest('hex');

function loadApprovedV1() {
  const entries = [];
  for (const item of manifest.keys) {
    const keyText = fs.readFileSync(path.join(directory, 'keys', item.method_id + '.key.json'), 'utf8');
    const packageText = fs.readFileSync(path.join(directory, item.package_file), 'utf8');
    const key = JSON.parse(keyText), pkg = JSON.parse(packageText);
    if (!Array.isArray(pkg.items) || pkg.items.length !== key.items) throw new Error('APPROVED_KEY_ITEM_MISMATCH:' + item.method_id);
    const ids = pkg.items.map(entry => entry && entry.id);
    if (ids.some((id, index) => id !== 'q' + String(index + 1).padStart(2, '0'))) throw new Error('APPROVED_ITEM_IDS_INVALID:' + item.method_id);
    entries.push({
      id: item.method_id,
      version: item.key_version,
      methodVersionId: item.method_id + '@' + item.key_version,
      key,
      pins: {key: sha(JSON.stringify(key))},
      package: pkg,
      title: pkg.title,
      itemCount: key.items,
      valid: key.valid.map(String),
      authors: [],
      search: []
    });
  }
  return entries;
}

const entries = loadApprovedV1();
module.exports = {entries, loadApprovedV1};
