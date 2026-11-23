"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const {approvedV1Releases}=require("../storage/approved-v1-release.js");
const {maiaLegacyRelease}=require("../storage/maia-legacy-release.js");
const {pinnedParticipantForm}=require("../dist/src/adapters/pinned-instrument-releases.js");

const instruction="В приведенном ниже списке утверждений укажите, насколько часто каждое из них соответствует вашему состоянию. Для ответа используйте шкалу от 0 до 5, где 0 – «Никогда», 5 – «Всегда», а значения 1, 2, 3 и 4 отражают промежуточную частоту.";

test("MAIA-R 1.0.1 shows approved 0–5 instruction without changing pinned release bytes",()=>{
  const release=approvedV1Releases().releases.find(item=>item.id==="maia_r_32");
  assert.ok(release);
  assert.equal(release.methodVersionId,"maia_r_32@1.0.1-staging");
  const before={formDigest:release.formDigest,keyDigest:release.keyDigest,formSnapshot:release.formSnapshot};
  const shown=pinnedParticipantForm({methodVersionId:release.methodVersionId,handlerVersion:release.handlerVersion,keyDigest:release.keyDigest});
  assert.equal(shown.instruction,instruction);
  assert.equal(shown.items.length,32);
  assert.deepEqual(shown.items[0].options.map(x=>x.value),["0","1","2","3","4","5"]);
  assert.notEqual(release.form.instruction,instruction,"presentation-only change must not mutate the pinned form");
  assert.deepEqual({formDigest:release.formDigest,keyDigest:release.keyDigest,formSnapshot:release.formSnapshot},before);
  assert.equal(JSON.parse(release.formSnapshot).instruction,release.form.instruction);
});

test("MAIA-R 1.0.0 retains historic instruction and 1–6 codes",()=>{
  const historic=maiaLegacyRelease();
  const shown=pinnedParticipantForm({methodVersionId:historic.methodVersionId,handlerVersion:historic.handlerVersion,keyDigest:historic.keyDigest});
  assert.equal(shown.instruction,historic.form.instruction);
  assert.deepEqual(shown.items[0].options.map(x=>String(x.value)),["1","2","3","4","5","6"]);
});
