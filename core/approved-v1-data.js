'use strict';
// Calculation-layer entries for the approved library. Every key is a static require so
// this module performs no file-system access; package texts live in storage where the
// release builder loads them. A key whose digest does not match its file is a hard error.
const {createHash} = require('node:crypto');
const manifest = require('../methods/approved/v1/keys/manifest.json');
const keys = {
  uvlk_shipilov: require('../methods/approved/v1/keys/uvlk_shipilov.key.json'),
  reflexivity_karpov_27: require('../methods/approved/v1/keys/reflexivity_karpov_27.key.json'),
  sjo_20: require('../methods/approved/v1/keys/sjo_20.key.json'),
  hardiness_leontiev_rasskazova_45: require('../methods/approved/v1/keys/hardiness_leontiev_rasskazova_45.key.json'),
  qlesq_36_vodopyanova: require('../methods/approved/v1/keys/qlesq_36_vodopyanova.key.json'),
  co36_kunitsyna_36: require('../methods/approved/v1/keys/co36_kunitsyna_36.key.json'),
  pvq_rr_57: require('../methods/approved/v1/keys/pvq_rr_57.key.json'),
  ttf_atf_10: require('../methods/approved/v1/keys/ttf_atf_10.key.json')
};
const sha = value => 'sha256:' + createHash('sha256').update(value).digest('hex');

const entries = manifest.keys.map(item => {
  const key = keys[item.method_id];
  if (!key) throw new Error('APPROVED_KEY_MISSING:' + item.method_id);
  const pins = {key: sha(JSON.stringify(key))};
  return {
    id: item.method_id,
    version: item.key_version,
    methodVersionId: item.method_id + '@' + item.key_version,
    key,
    pins,
    title: item.title,
    itemCount: key.items,
    valid: key.valid.map(String),
    authors: item.author ? [item.author] : [],
    search: item.title ? [item.title] : []
  };
});

module.exports = {entries};