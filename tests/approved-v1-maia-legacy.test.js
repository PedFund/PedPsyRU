"use strict";
// The historical MAIA-R 1.0.0 release must stay resolvable after 1.0.1 becomes
// current, otherwise existing studies cannot open their own forms or results.
const {test} = require("node:test");
const assert = require("node:assert/strict");
const {maiaLegacyRelease} = require("../storage/maia-legacy-release.js");
const {verifyPinnedChoiceRelease, pinnedParticipantForm} = require("../dist/src/adapters/pinned-instrument-releases.js");

test("MAIA-R 1.0.0 remains a pinned historical release with its original answer codes", () => {
  const release = maiaLegacyRelease();
  assert.equal(release.methodVersionId, "maia_r_32@1.0.0-staging");
  assert.equal(release.handlerVersion, "approved-numeric-1.0.0");
  assert.equal(release.verificationState, "legacy_checked");
  assert.deepEqual(release.form.items[0].options.map(option => String(option.value)), ["1", "2", "3", "4", "5", "6"]);
  assert.equal(release.formDigest, "sha256:6be4b316d9c6738e26f32c38ebca2fc54b9467621901f9771a7e4faa29bd835b");
  assert.equal(release.keyDigest, "sha256:10d1e33e0ee34a3c61a2e33e89063b6ca0ddf341d266748c6b9fcb96a6a8043f");
});

test("the runtime accepts the historical MAIA-R release row and its form", () => {
  const release = maiaLegacyRelease();
  const row = {id: "00000000-0000-4000-8000-00000000e111", method_version_id: release.methodVersionId,
    handler_version: release.handlerVersion, contract_version: "1.0", form_id: release.form.id,
    form_version: release.form.version, form_snapshot: JSON.parse(release.formSnapshot),
    form_digest: release.formDigest, key_digest: release.keyDigest, verification_state: release.verificationState,
    publication_state: "draft"};
  const items = release.form.items.map((item, index) => ({item_id: item.id, ordinal: index + 1, options: item.options}));
  const pinned = verifyPinnedChoiceRelease(row, items);
  assert.equal(pinned.methodVersionId, release.methodVersionId);
  assert.deepEqual(pinned.choiceValues, ["1", "2", "3", "4", "5", "6"]);
  const form = pinnedParticipantForm(pinned);
  assert.equal(form.id, "maia_r_32_shared");
  assert.deepEqual(form.items[0].options.map(option => String(option.value)), ["1", "2", "3", "4", "5", "6"]);
});
