'use strict';
// Package-text loader for the approved library. Keys and their digests come from the
// calculation layer (core/approved-v1-data.js); this module only attaches the approved
// package text and checks that it still matches the key's item count and ids.
const fs = require('node:fs');
const path = require('node:path');
const {entries: coreEntries} = require('../core/approved-v1-data.js');

const directory = path.join(__dirname, '..', 'methods', 'approved', 'v1');
const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'keys', 'manifest.json'), 'utf8'));
const packageFile = new Map(manifest.keys.map(item => [item.method_id, item.package_file]));

function loadApprovedV1() {
  return coreEntries.map(entry => {
    const file = packageFile.get(entry.id);
    if (!file) throw new Error('APPROVED_PACKAGE_FILE_MISSING:' + entry.id);
    const pkg = JSON.parse(fs.readFileSync(path.join(directory, file), 'utf8'));
    if (!Array.isArray(pkg.items) || pkg.items.length !== entry.itemCount) throw new Error('APPROVED_KEY_ITEM_MISMATCH:' + entry.id);
    if (pkg.items.some((item, index) => !item || item.id !== 'q' + String(index + 1).padStart(2, '0'))) {
      throw new Error('APPROVED_ITEM_IDS_INVALID:' + entry.id);
    }
    return {...entry, package: pkg};
  });
}

const entries = loadApprovedV1();
module.exports = {entries, loadApprovedV1};