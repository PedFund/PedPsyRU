"use strict";
// Which approved packages can be stored as a *release* right now, and why the rest
// cannot: a release must fit the pinned option sets and the single-choice screen.
const {test} = require("node:test");
const assert = require("node:assert/strict");
const {approvedV1Releases} = require("../storage/approved-v1-release.js");

test("only packages with a pinned option set become releases", () => {
  const {releases, unsupported} = approvedV1Releases();
  assert.deepEqual(releases.map(r => r.id).sort(), ["co36_kunitsyna_36", "hardiness_leontiev_rasskazova_45", "qlesq_36_vodopyanova", "reflexivity_karpov_27", "ryff_pwb_84_shevelenkova_fesenko", "sjo_20", "ttf_atf_10", "uvlk_shipilov"]);
  const reasons = Object.fromEntries(unsupported.map(item => [item.method_id, item.reason]));
  assert.equal(reasons.pvq_rr_57, "UNSUPPORTED_OPTION_SHAPE");
});

test("a release form is canonical, complete and single-choice only", () => {
  for (const release of approvedV1Releases().releases) {
    assert.equal(release.form.items.length, release.itemCount);
    release.form.items.forEach((item, index) => {
      assert.equal(item.id, "q" + String(index + 1).padStart(2, "0"));
      assert.equal(item.number, index + 1);
      assert.ok(item.text.length > 0);
      assert.deepEqual(item.options.map(option => option.value), release.form.items[0].options.map(option => option.value));
    });
    assert.match(release.formDigest, /^sha256:[a-f0-9]{64}$/);
    assert.match(release.keyDigest, /^sha256:[a-f0-9]{64}$/);
    assert.equal(release.handlerVersion, "approved-numeric-1.0.0");
    assert.equal(release.verificationState, "legacy_checked");
  }
});

test("release digests are stable across runs", () => {
  const first = approvedV1Releases().releases.map(r => r.formDigest + "|" + r.keyDigest);
  const second = approvedV1Releases().releases.map(r => r.formDigest + "|" + r.keyDigest);
  assert.deepEqual(first, second);
});
