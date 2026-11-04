import test from "node:test";
import assert from "node:assert/strict";
import {approvedV1Releases} from "../storage/approved-v1-release.js";
import {pinnedParticipantForm} from "../dist/src/adapters/pinned-instrument-releases.js";

// A presentation correction must never change the pinned stimulus: it only replaces the
// title and the instruction shown above it.
const release = approvedV1Releases().releases.find(entry => entry.id === "ryff_pwb_84_shevelenkova_fesenko");
const base = {
  id: "release-under-test", contractVersion: "1.0", methodVersionId: release.methodVersionId,
  handlerVersion: release.handlerVersion, keyDigest: release.keyDigest, itemIds: [], choiceValues: []
};

test("the pinned form is returned unchanged when no correction exists", () => {
  const form = pinnedParticipantForm(base);
  assert.equal(form.id, release.form.id);
  assert.equal(form.instruction, "");
  assert.equal(form.items.length, release.itemCount);
});

test("an instruction correction is shown without touching the items", () => {
  const form = pinnedParticipantForm({...base, presentation: {instruction: "Прочитайте утверждения."}});
  assert.equal(form.instruction, "Прочитайте утверждения.");
  assert.deepEqual(form.items, pinnedParticipantForm(base).items);
});

test("a title correction replaces only the title", () => {
  const plain = pinnedParticipantForm(base);
  const form = pinnedParticipantForm({...base, presentation: {title: "Склонность к прощению"}});
  assert.equal(form.title, "Склонность к прощению");
  assert.equal(form.instruction, plain.instruction);
  assert.deepEqual(form.items, plain.items);
});

test("an empty correction object leaves the pinned form untouched", () => {
  const plain = pinnedParticipantForm(base);
  assert.deepEqual(pinnedParticipantForm({...base, presentation: {}}), plain);
});
