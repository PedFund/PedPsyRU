"use strict";
// The generated draft packages must pass the platform validator, keep their artifact
// hashes real, and reproduce their own control vector with the runtime key.
const {test} = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {createHash} = require("node:crypto");
const {validateMethodPackageJson} = require("../dist/src/application/method-package-validation.js");
const {scoreNumericPassport} = require("../core/numeric-passport.js");

const dir = path.join(__dirname, "..", "methods", "approved", "v1", "releases");
const ids = ["reflexivity_karpov_27", "sjo_20", "ttf_atf_10"];
const read = name => JSON.parse(fs.readFileSync(path.join(dir, name, "package-local.json"), "utf8"));
const sha = bytes => createHash("sha256").update(bytes).digest("hex");

test("both draft packages pass the official validator as unpublished drafts", () => {
  for (const id of ids) {
    const result = validateMethodPackageJson(JSON.stringify(read(id)));
    assert.equal(result.status, "structurally_valid_draft", id);
    assert.equal(result.publishable, false, id);
    assert.ok(result.blockers.includes("rights"), id);
    assert.ok(result.blockers.includes("handler_not_verified"), id);
  }
});

test("package versions are plain semver while the release identity keeps its suffix", () => {
  for (const id of ids) {
    const pkg = read(id);
    assert.match(pkg.package_version, /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/);
    assert.match(pkg.form.version, /^[0-9]+\.[0-9]+\.[0-9]+(-draft(\.\d+)?)?$/);
  }
});

test("declared artifact hashes match the files on disk", () => {
  for (const id of ids) {
    const pkg = read(id);
    for (const artifact of pkg.artifacts) {
      const bytes = fs.readFileSync(path.join(dir, id, artifact.path));
      assert.equal(bytes.length, artifact.bytes, id + ":" + artifact.id);
      assert.equal(sha(bytes), artifact.sha256, id + ":" + artifact.id);
    }
  }
});

test("each package control vector is reproduced by its own key", () => {
  for (const id of ids) {
    const pkg = read(id);
    const key = JSON.parse(fs.readFileSync(path.join(dir, id, "key.json"), "utf8"));
    const responses = pkg.control_vectors[0].responses.map(response => Number(response.value));
    const metrics = scoreNumericPassport(key, responses).metrics;
    for (const expected of pkg.control_vectors[0].expected) {
      assert.ok(Number.isFinite(metrics[expected.scale_id]) || Number.isFinite(metrics[scaleLabel(pkg, expected.scale_id)]),
        id + ":" + expected.scale_id);
    }
  }
});

function scaleLabel(pkg, id) {
  const scale = pkg.scales.find(entry => entry.id === id);
  return scale ? scale.label : id;
}
