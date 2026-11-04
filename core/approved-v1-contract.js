'use strict';
// Verified runtime for the approved-library numeric packages. Scoring delegates to
// the existing scoreNumericPassport engine; this module only checks identity,
// rejects a wrong key digest and projects metrics into the instrument contract.
// Entries are injected: the calculation layer performs no I/O of its own.
const {createHash} = require('node:crypto');
const {scoreNumericPassport} = require('./numeric-passport.js');

const CONTRACT_VERSION = '1.0';
const HANDLER_VERSION = 'approved-numeric-1.0.0';
const sha = value => 'sha256:' + createHash('sha256').update(value).digest('hex');
const LEVEL_SUFFIX = ' – уровень';

function createApprovedNumericScorer(entries) {
  if (!Array.isArray(entries) || !entries.length) throw new Error('APPROVED_ENTRIES_REQUIRED');
  return function scoreApprovedNumeric(input) {
    const method = input && typeof input.method_version_id === 'string'
      ? entries.find(entry => entry.methodVersionId === input.method_version_id) : null;
    const result = {
      contract_version: CONTRACT_VERSION, method_version_id: method ? method.methodVersionId : '',
      handler_version: HANDLER_VERSION, status: 'invalid', validation_state: 'legacy_checked',
      quality: {valid_response_count: 0, complete: false, usable_for_aggregation: false},
      measures: [], classifications: [], warnings: [],
      calculation: {algorithm_id: HANDLER_VERSION, key_digest: method ? method.pins.key : ''}
    };
    const invalid = code => { result.warnings = [{code: code || 'INVALID_RESPONSES', severity: 'error', details: {}}]; return result; };
    if (!method || sha(JSON.stringify(method.key)) !== method.pins.key) return invalid('KEY_DIGEST_MISMATCH');
    if (!input || typeof input !== 'object' || Array.isArray(input) ||
        Object.keys(input).sort().join(',') !== 'contract_version,handler_version,method_version_id,responses' ||
        input.contract_version !== CONTRACT_VERSION || input.handler_version !== HANDLER_VERSION ||
        !Array.isArray(input.responses) || input.responses.length !== method.itemCount) return invalid();
    const values = new Map();
    for (const response of input.responses) {
      const index = typeof (response && response.item_id) === 'string' ? Number(response.item_id.slice(1)) : NaN;
      if (!response || typeof response !== 'object' || Array.isArray(response) ||
          Object.keys(response).sort().join(',') !== 'item_id,value' ||
          !Number.isInteger(index) || index < 1 || index > method.itemCount ||
          response.item_id !== 'q' + String(index).padStart(2, '0') ||
          typeof response.value !== 'string' || !method.valid.includes(response.value) ||
          values.has(response.item_id)) return invalid();
      values.set(response.item_id, Number(response.value));
    }
    const answers = Array.from({length: method.itemCount}, (_, index) => values.get('q' + String(index + 1).padStart(2, '0')));
    let scored;
    try { scored = scoreNumericPassport(method.key, answers); }
    catch (error) { return invalid(/Quota/.test(error.message) ? 'QUOTA_VIOLATION' : 'INVALID_RESPONSES'); }
    const labels = method.labels || {};
    const display = name => {
      const cut = name.indexOf(' – ');
      const stem = cut < 0 ? name : name.slice(0, cut);
      const suffix = cut < 0 ? '' : name.slice(cut);
      const russian = labels[stem] || labels[stem.toLowerCase()] || labels[name];
      return russian ? russian + suffix : name;
    };
    for (const [name, value] of Object.entries(scored.metrics)) {
      if (typeof value === 'number') {
        result.measures.push({code: name, label: display(name), value, value_type: 'number',
          representation: name.includes(' – стен') ? 'sten' : 'raw', precision: method.key.fullPrecision === true ? 4 : 2});
      } else if (typeof value === 'string') {
        result.classifications.push({code: name, label: display(name), value, basis: 'approved_contract'});
      }
    }
    if (!result.measures.length) return invalid();
    result.status = 'scored';
    result.quality = {valid_response_count: method.itemCount, complete: true, usable_for_aggregation: true};
    result.warnings = [{code: 'APPROVED_DRAFT_RESEARCH_ONLY', severity: 'warning',
      details: {basis: 'issue_69_approved_content_pending_rights', scientific_approval: false, publication: 'draft'}}];
    if (scored.warnings.length) result.warnings.push({code: 'AMBIGUOUS_NORMS', severity: 'warning', details: {}});
    return result;
  };
}

module.exports = {createApprovedNumericScorer, CONTRACT_VERSION, HANDLER_VERSION, LEVEL_SUFFIX};
