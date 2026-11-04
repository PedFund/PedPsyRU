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

// Migration 055 accepts any labelled numeric scale 1..N (2..20) plus the A/B pair.
// The exact option array is still pinned by the release form digest.
function numericScaleValid(options) {
  return Array.isArray(options) && options.length >= 2 && options.length <= 20 &&
    options.every((option, index) => option && String(option.value) === String(index + 1) &&
      typeof option.text === 'string' && option.text.trim().length > 0);
}

function optionsFor(pkg, methodId) {
  const declared = Array.isArray(pkg.response_options) ? pkg.response_options : [];
  if (!declared.length) {
    // An integer scale documents its bounds per item and explicitly has no word labels
    // for intermediate values, so the numbers themselves are the labels.
    const bounds = (pkg.items || []).map(item => [Number(item.response_min), Number(item.response_max)]);
    const consistent = bounds.length && bounds.every(([min, max]) => min === 1 && Number.isInteger(max) && max >= 2 && max <= 20 && max === bounds[0][1]);
    if (!consistent) throw new Error(methodId + ':NO_RESPONSE_OPTIONS');
    return Array.from({length: bounds[0][1]}, (_, index) => ({value: String(index + 1), text: String(index + 1)}));
  }
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
    const anchored = typeof item.title === 'string' && item.title.trim() && typeof item.anchor_1 === 'string' && typeof item.anchor_10 === 'string'
      ? item.title.trim() + '. ' + item.anchor_1.trim() + ' … ' + item.anchor_10.trim() : '';
    if (!text && !anchored) throw new Error(entry.id + ':UNSUPPORTED_ITEM_PRESENTATION');
    if (item.id !== 'q' + String(index + 1).padStart(2, '0')) throw new Error(entry.id + ':NON_CANONICAL_ITEM_ID');
    return {id: item.id, number: index + 1, text: text || anchored, options};
  });
  if (options.map(option => option.value).join(',') !== entry.valid.join(',')) {
    throw new Error(entry.id + ':OPTIONS_DO_NOT_MATCH_KEY_VALUES');
  }
  if (!numericScaleValid(options)) throw new Error(entry.id + ':OPTION_SET_NOT_PINNED');
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
      labels: entry.labels || {},
      outputs: [...Object.keys(entry.key.scales || {}), ...Object.keys(entry.key.derived || {})]
    });
  }
  return {releases, unsupported};
}

module.exports = {approvedV1Releases, formFor};
