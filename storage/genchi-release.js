"use strict";
// Genchi breath-hold probe release. The instrument is a functional measurement: two
// technical fields carry it through the existing attempt protocol, while the screen
// shows one numeric input. The key file pins the sex-dependent thresholds.
const {createHash} = require("node:crypto");
const key = require("../methods/genchi/key.json");
const {canonicalJson} = require("./releases.js");
const {GENCHI_KEY_DIGEST: keyDigest} = require("../core/genchi-key.js");
const sha = value => "sha256:" + createHash("sha256").update(value).digest("hex");
const option = value => ({value: String(value), text: String(value)});
const form = {
  id: "genchi_breath_hold_shared", version: "1.0.0", title: "Проба Генчи",
  instruction: "Задержите дыхание на выдохе и замерьте время секундомером. Введите результат в секундах.",
  language: "ru",
  presentation: {id: "pedpsy/breath-hold", version: "1.0.0"},
  rules: {require_all: true},
  items: [
    {id: "q01", number: 1, text: "Время задержки дыхания, с", options: Array.from({length: 601}, (_, value) => option(value))},
    {id: "q02", number: 2, text: "Пол", options: [{value: "male", text: "Мужской"}, {value: "female", text: "Женский"}]}
  ]
};
function genchiReleasePackage() {
  return {methodVersionId: "genchi_breath_hold@1.0.0", handlerVersion: key.handler, verificationState: "key_verified",
    form, formSnapshot: canonicalJson(form), formDigest: sha(canonicalJson(form)), keyDigest};
}
module.exports = {genchiReleasePackage, GENCHI_FORM: form, GENCHI_KEY: key, GENCHI_KEY_DIGEST: keyDigest};
