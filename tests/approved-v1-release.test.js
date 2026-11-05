"use strict";
// Which approved packages can be stored as a *release* right now, and why the rest
// cannot: a release must fit the pinned option sets and the single-choice screen.
const {test} = require("node:test");
const assert = require("node:assert/strict");
const {approvedV1Releases} = require("../storage/approved-v1-release.js");

test("only packages with a pinned option set become releases", () => {
  const {releases, unsupported} = approvedV1Releases();
  assert.deepEqual(releases.map(r => r.id).sort(), ["co36_kunitsyna_36", "hardiness_leontiev_rasskazova_45", "motkov_psychological_culture_18", "pvq_rr_57", "qlesq_36_vodopyanova", "reflexivity_karpov_27", "ryff_pwb_84_shevelenkova_fesenko", "sjo_20", "ttf_atf_10", "uvlk_shipilov"]);
  assert.deepEqual(unsupported, []);
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

test("PVQ-RR uses the owner-supplied shared text, instruction and six anchors", () => {
  const release = approvedV1Releases().releases.find(item => item.id === "pvq_rr_57");
  assert.ok(release);
  assert.equal(release.form.items.length, 57);
  assert.equal(release.form.items[0].text, "Для него важно самостоятельно формировать свои взгляды.");
  assert.equal(release.form.items[56].text, "Для него важно принимать людей такими, какие они есть, даже если он с ними не согласен.");
  assert.match(release.form.instruction, /Ниже приведены описания некоторых людей\./);
  assert.match(release.form.instruction, /адаптация Т\. П\. Бутенко и др\. \(2012\)/);
  assert.deepEqual(release.form.items[0].options.map(option => option.text), [
    "Совсем не похож на меня",
    "Не похож на меня",
    "Мало похож на меня",
    "Умеренно похож на меня",
    "Похож на меня",
    "Очень похож на меня"
  ]);
  assert.equal(release.labels.SDT, "Самостоятельность / мысли");
  assert.equal(release.labels.conservation, "Сохранение");
});

test("Motkov presents odd A items and even B items with their own answer wording", () => {
  const release = approvedV1Releases().releases.find(item => item.id === "motkov_psychological_culture_18");
  assert.ok(release);
  assert.equal(release.form.items.length, 36);
  assert.equal(release.form.items[0].text, "Четко осознавать и понимать себя, свои желания, свой характер.");
  assert.equal(release.form.items[1].text, "Четко осознавать и понимать себя, свои желания, свой характер.");
  assert.deepEqual(release.form.items[0].options.map(option => option.text), [
    "Очень слабое стремление",
    "Слабое стремление",
    "Среднее по силе стремление",
    "Сильное стремление",
    "Очень сильное стремление"
  ]);
  assert.deepEqual(release.form.items[1].options.map(option => option.text), [
    "Очень слабая степень осуществления",
    "Слабая степень осуществления",
    "Средняя степень осуществления",
    "Высокая степень осуществления",
    "Очень высокая степень осуществления"
  ]);
  assert.match(release.form.instruction, /18 пунктов/);
  assert.equal(release.labels.pk_A, "Психологическая культура — стремления (общий)");
});
