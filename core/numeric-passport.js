'use strict';

// Internal groundwork for complete numeric questionnaires from the owner library.
// This is not a release registry and does not accept executable code from a form.
function scoreNumericPassport(def, responses) {
  if (!def || def.type !== 'passport' || !Number.isInteger(def.items) || def.items < 1 ||
      !Array.isArray(def.valid) || !def.valid.length || !Array.isArray(responses) ||
      responses.length !== def.items || responses.some(x => !Number.isFinite(x) || !def.valid.includes(x))) {
    throw new Error('Invalid complete numeric questionnaire');
  }
  if (def.responseConstraints && def.responseConstraints.length) {
    throw new Error('Questionnaire requires a specialized adapter');
  }
  let scoringResponses = responses;
  if (def.inputTransform) {
    const transform = def.inputTransform;
    if (!transform || Object.keys(transform).sort().join(',') !== 'max,op' ||
        transform.op !== 'reverse' || !Number.isFinite(transform.max)) {
      throw new Error('Questionnaire requires a specialized adapter');
    }
    scoringResponses = responses.map(value => transform.max - value);
  }
  const metrics = Object.create(null), warnings = [];
  const rounded = (value, digits = 2) => Number(value.toFixed(digits));
  const getItems = ids => {
    if (!Array.isArray(ids) || ids.some(i => !Number.isInteger(i) || i < 1 || i > def.items)) throw new Error('Invalid scale items');
    return ids.map(i => scoringResponses[i - 1]);
  };
  const put = (name, value) => {
    if (!Number.isFinite(value)) throw new Error('Non-finite score');
    metrics[name] = rounded(value);
  };
  for (const [name, scale] of Object.entries(def.scales || {})) {
    if (scale.aggregate === 'difference_affine') {
      const positive = getItems(scale.positive || []), negative = getItems(scale.negative || []);
      if (!positive.length || !negative.length || !Number.isFinite(scale.offset) ||
          !Number.isFinite(scale.divisor) || scale.divisor === 0) throw new Error('Invalid affine difference scale');
      put(name, (positive.reduce((a, b) => a + b, 0) - negative.reduce((a, b) => a + b, 0) + scale.offset) / scale.divisor);
      continue;
    }
    const direct = getItems(scale.items || scale.direct || []);
    const reversed = getItems(scale.reverse || []);
    const max = scale.reverseMax ?? def.reverseMax;
    if (reversed.length && !Number.isFinite(max)) throw new Error('Missing reversal constant');
    const values = direct.concat(reversed.map(v => max - v));
    if (!values.length) throw new Error('Empty or unsupported scale');
    const sum = values.reduce((a, b) => a + b, 0);
    if (scale.aggregate === 'sum') put(name, sum);
    else if (scale.aggregate === 'mean') put(name, sum / values.length);
    else throw new Error('Unsupported scale aggregation');
  }
  for (const [name, d] of Object.entries(def.derived || {})) {
    let value;
    if (d.op === 'sum' || d.op === 'mean') {
      const values = (d.inputs || []).map(k => metrics[k]);
      if (!values.length || values.some(v => !Number.isFinite(v))) throw new Error('Invalid derived inputs');
      value = values.reduce((a, b) => a + b, 0) / (d.op === 'mean' ? values.length : 1);
      if (d.factor != null) value *= d.factor;
    } else if (d.op === 'ratio_to_mean') {
      const values = (d.denominatorInputs || []).map(k => metrics[k]);
      if (!Number.isFinite(metrics[d.numerator]) || !values.length || values.some(v => !Number.isFinite(v))) throw new Error('Invalid ratio inputs');
      const denominator = values.reduce((a, b) => a + b, 0) / values.length;
      if (denominator === 0) throw new Error('Undefined ratio');
      value = metrics[d.numerator] / denominator;
    } else if (d.op === 'abs_difference') {
      const values = (d.inputs || []).map(k => metrics[k]);
      if (values.length !== 2 || values.some(v => !Number.isFinite(v))) throw new Error('Invalid difference inputs');
      value = Math.abs(values[0] - values[1]);
    } else throw new Error('Unsupported derived operation');
    put(name, value);
  }
  for (const [name, range] of Object.entries(def.ranges || {})) {
    if (!Number.isFinite(metrics[name]) || metrics[name] < range[0] || metrics[name] > range[1]) throw new Error('Score outside declared range');
  }
  const lookup = (value, ranges) => {
    if (!Array.isArray(ranges)) throw new Error('Invalid conversion table');
    const row = ranges.find(([lo, hi]) => (lo == null || value >= lo) && (hi == null || value <= hi));
    return row ? row[2] : null;
  };
  for (const [name, norm] of Object.entries(def.norms || {})) {
    if (!Number.isFinite(metrics[name])) throw new Error('Invalid norm input');
    if ((norm.ambiguous || []).includes(metrics[name])) {
      warnings.push(name + ': нормативное преобразование неоднозначно для значения ' + metrics[name] + ' и не рассчитано');
      continue;
    }
    const input = Number.isInteger(norm.round) ? rounded(metrics[name], norm.round) : metrics[name];
    const value = lookup(input, norm.ranges);
    if (value != null) metrics[name + (norm.suffix || ' – уровень')] = value;
  }
  for (const [name, ranges] of Object.entries(def.levels || {})) {
    if (!Number.isFinite(metrics[name])) throw new Error('Invalid level input');
    const value = lookup(metrics[name], ranges);
    if (value != null) metrics[name + ' – уровень'] = value;
  }
  for (const [name, criterion] of Object.entries(def.criteria || {})) {
    if (!Number.isFinite(metrics[name]) || !Number.isFinite(criterion)) throw new Error('Invalid criterion');
    if (def.criteriaRule === 'below_deficit') metrics[name + ' – относительно критерия'] = metrics[name] < criterion ? 'дефицит характеристики' : 'не ниже критериального значения';
    else if (def.criteriaRule === 'higher_or_equal_problem') metrics[name + ' – относительно cut-off'] = metrics[name] >= criterion ? 'проблемная область' : 'ниже клинического cut-off';
    else throw new Error('Unsupported criterion');
  }
  return { metrics: { ...metrics }, warnings, status: Object.keys(metrics).length ? 'Обработано' : 'Неполные или некорректные ответы' };
}

module.exports = { scoreNumericPassport };
