"use strict";
const {test} = require("node:test");
const assert = require("node:assert/strict");
const {checkLock} = require("../scripts/check-dependencies.js");
const manifest = {dependencies: {reviewed: "1.0.0"}};
function lock() {return {lockfileVersion: 3, packages: {"": manifest, "node_modules/reviewed": {
  version: "1.0.0", resolved: "https://registry.npmjs.org/reviewed/-/reviewed-1.0.0.tgz", integrity: "sha512-synthetic", license: "MIT"
}}};}
test("lock policy checks actual repository dependency closure", () => {
  assert.deepEqual(checkLock(require("../package.json"), require("../package-lock.json")), []);
});
test("lock policy rejects mutable version, mismatch and missing package", () => {
  assert.ok(checkLock({dependencies: {reviewed: "^1.0.0"}}, lock()).length);
  const input = lock(); delete input.packages["node_modules/reviewed"];
  assert.ok(checkLock(manifest, input).length);
});
test("lock policy rejects remote origins, missing integrity, unreviewed licenses and scripts", () => {
  for (const change of [{resolved: "https://example.invalid/package"}, {integrity: ""}, {license: "unknown"}, {hasInstallScript: true}]) {
    const input = lock(); Object.assign(input.packages["node_modules/reviewed"], change);
    assert.ok(checkLock(manifest, input).length);
  }
});
