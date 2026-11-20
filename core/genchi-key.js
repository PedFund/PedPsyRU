'use strict';
// Genchi key material. Calculation core stays pure: thresholds are inline data, the
// digest pins them for the release. methods/genchi/key.json mirrors this object for
// humans and is checked against it by the tests.
const {createHash} = require('node:crypto');
const GENCHI_KEY = {
  id: 'genchi_breath_hold',
  type: 'functional_measurement',
  handler: 'genchi-measurement-1.0.0',
  max_seconds: 600,
  thresholds: {
    male: [
      {max_exclusive: 20, rating: 'неудовлетворительно'},
      {max_exclusive: 30, rating: 'удовлетворительно'},
      {max_exclusive: 40, rating: 'хорошо'},
      {max_exclusive: null, rating: 'отлично'}
    ],
    female: [
      {max_exclusive: 15, rating: 'неудовлетворительно'},
      {max_exclusive: 20, rating: 'удовлетворительно'},
      {max_exclusive: 30, rating: 'хорошо'},
      {max_exclusive: null, rating: 'отлично'}
    ]
  }
};
const GENCHI_KEY_DIGEST = 'sha256:' + createHash('sha256').update(JSON.stringify(GENCHI_KEY)).digest('hex');
function ratingFor(sex, duration) {
  const bands = GENCHI_KEY.thresholds[sex];
  if (!Array.isArray(bands)) throw new Error('GENCHI_SEX_REQUIRED');
  const band = bands.find(item => item.max_exclusive === null || duration < item.max_exclusive);
  if (!band) throw new Error('GENCHI_RATING_OUT_OF_RANGE');
  return band.rating;
}
module.exports = {GENCHI_KEY, GENCHI_KEY_DIGEST, ratingFor};
