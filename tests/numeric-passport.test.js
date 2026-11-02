'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { scoreNumericPassport } = require('../core/numeric-passport');
const library = require('../methods/legacy/library.json');
const fixtures = require('./numeric-passport-owner-vectors.json');
for (const fixture of fixtures) {
  test('numeric owner reference: ' + fixture.id, () => {
    const d = library.methods.find(x => x.method_id === fixture.id).definition;
    for (const vector of fixture.vectors) assert.deepEqual(scoreNumericPassport(d, vector.values), vector.expected);
    assert.throws(() => scoreNumericPassport(d, Array(d.items).fill(null)));
    assert.throws(() => scoreNumericPassport(d, Array(d.items - 1).fill(d.valid[0])));
    assert.throws(() => scoreNumericPassport(d, Array(d.items).fill(999)));
    assert.throws(() => scoreNumericPassport({ ...d, inputTransform: { op: 'unknown', max: 6 } }, Array(d.items).fill(d.valid[0])));
  });
}
test('numeric engine supports the fixed ODREV reverse input and affine differences only', () => {
  const d=library.methods.find(x=>x.method_id==='odrev_zakharova_66').definition;
  const answers=Array.from({length:d.items},(_,i)=>d.valid[i%d.valid.length]);
  const scored=scoreNumericPassport(d,answers);
  assert.equal(scored.metrics['Способность воспринимать состояние ребенка'],2.2);
  assert.equal(scored.metrics['Понимание причин состояния ребенка'],2);
  assert.equal(scored.metrics['Способность воспринимать состояние ребенка – относительно критерия'],'дефицит характеристики');
  assert.throws(()=>scoreNumericPassport({...d,inputTransform:{op:'reverse',max:6,extra:true}},answers));
  assert.throws(()=>scoreNumericPassport({...d,scales:{bad:{positive:[1],negative:[],aggregate:'difference_affine',offset:1,divisor:5}}},answers));
});
