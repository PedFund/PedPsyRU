'use strict';
// Pinned-release descriptions for approved-library packages that fit the existing
// single-choice screen (one item per slide, labelled options, one numeric answer).
// A package with a different presentation (bipolar scale, anchors, gender forms,
// quotas) is reported as unsupported instead of being flattened into a form that
// would change what the participant actually answers.
const {createHash} = require('node:crypto');
const {entries} = require('./approved-v1-data.js');
const {canonicalJson} = require('./releases.js');

const sha = value => 'sha256:' + createHash('sha256').update(value).digest('hex');
const HANDLER = 'approved-numeric-1.0.0';

// The database pins the exact option sets a release item may carry
// (release_item_pinned_choices). A package whose option set is not listed there
// cannot be stored without relaxing a safety constraint, so it is reported instead.
const PINNED_OPTION_SETS = [
  ['A', 'B'],
  ['1', '2', '3', '4'],
  ['1', '2', '3', '4', '5', '6', '7']
];

function optionsFor(pkg, methodId) {
  const declared = Array.isArray(pkg.response_options) ? pkg.response_options : [];
  if (!declared.length) throw new Error(methodId + ':NO_RESPONSE_OPTIONS');
  const options = declared.map(option => {
    const value = option && (option.value !== undefined ? option.value : option.ui_value);
    const text = option && (option.label !== undefined ? option.label
      : option.text !== undefined ? option.text
      : option.display_score !== undefined ? String(option.display_score) : undefined);
    if (value === undefined || typeof text !== 'string' || !text.trim()) throw new Error(methodId + ':UNSUPPORTED_OPTION_SHAPE');
    return {value: String(value), text};
  });
  if (new Set(options.map(option => option.value)).size !== options.length) throw new Error(methodId + ':DUPLICATE_OPTION_VALUE');
  return options;
}

function formFor(entry) {
  const pkg = entry.package;
  if (!Array.isArray(pkg.items) || !pkg.items.length) throw new Error(entry.id + ':NO_ITEMS');
  const options = optionsFor(pkg, entry.id);
  const items = pkg.items.map((item, index) => {
    // A bipolar item carries two anchors instead of a sentence; both are shown.
    const text = typeof item.text === 'string' && item.text.trim() ? item.text.trim()
      : (typeof item.left === 'string' && typeof item.right === 'string' && item.left.trim() && item.right.trim()
        ? item.left.trim() + ' — ' + item.right.trim() : '');
    if (!text) throw new Error(entry.id + ':UNSUPPORTED_ITEM_PRESENTATION');
    if (item.id !== 'q' + String(index + 1).padStart(2, '0')) throw new Error(entry.id + ':NON_CANONICAL_ITEM_ID');
    return {id: item.id, number: index + 1, text, options};
  });
  if (options.map(option => option.value).join(',') !== entry.valid.join(',')) {
    throw new Error(entry.id + ':OPTIONS_DO_NOT_MATCH_KEY_VALUES');
  }
  if (!PINNED_OPTION_SETS.some(set => set.join(',') === options.map(option => option.value).join(','))) {
    throw new Error(entry.id + ':OPTION_SET_NOT_PINNED');
  }
  return {id: entry.id + '_shared', version: '1.0.0', method_id: entry.id, title: entry.title,
    language: pkg.language || 'ru', instruction: pkg.instructions || '', items};
}

function approvedV1Releases() {
  const releases = [];
  const unsupported = [];
  for (const entry of entries) {
    let form;
    try { form = formFor(entry); }
    catch (error) {
      if (error.message === entry.id + ':UNSUPPORTED_OPTION_SHAPE' || error.message === entry.id + ':UNSUPPORTED_ITEM_PRESENTATION' ||
          error.message === entry.id + ':OPTIONS_DO_NOT_MATCH_KEY_VALUES' || error.message === entry.id + ':NO_RESPONSE_OPTIONS' ||
          error.message === entry.id + ':OPTION_SET_NOT_PINNED') {
        unsupported.push({method_id: entry.id, reason: error.message.slice(entry.id.length + 1)});
        continue;
      }
      throw error;
    }
    releases.push({
      id: entry.id,
      title: entry.title,
      authors: entry.authors,
      search: entry.search,
      form,
      itemCount: entry.itemCount,
      methodVersionId: entry.methodVersionId,
      handlerVersion: HANDLER,
      formSnapshot: canonicalJson(form),
      formDigest: sha(canonicalJson(form)),
      keyDigest: entry.pins.key,
      verificationState: 'legacy_checked',
      outputs: [...Object.keys(entry.key.scales || {}), ...Object.keys(entry.key.derived || {})]
    });
  }
  return {releases, unsupported};
}

module.exports = {approvedV1Releases, formFor};
