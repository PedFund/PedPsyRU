"use strict";
const {test} = require("node:test");
const assert = require("node:assert/strict");
const {checkArchitecture} = require("../scripts/check-architecture.js");
const check = (sources, manifest = {}, approved = []) => checkArchitecture(Object.keys(sources), sources, manifest, approved);
test("architecture guard permits isolated calculation and declared runtime adapter", () => {
  assert.deepEqual(check({"core/score.js": 'const c = require("node:crypto");', "storage/store.js": 'require("../core/score.js"); require("pg");'}, {dependencies: {pg: "1.0.0"}}, ["pg"]), []);
});
test("architecture guard recognizes prefix-only Node builtins used by the pilot", () => {
  assert.deepEqual(check({"storage/database.js": 'require("node:sqlite");'}), []);
  assert.deepEqual(check({"core/score.js": '// Excel normalization belongs in an import adapter.\nrequire("node:crypto");'}), []);
});
test("architecture guard rejects core depending on storage", () => {
  assert.ok(check({"core/score.js": 'require("../storage/store.js");', "storage/store.js": ""}).some(x => x.includes("crosses boundary")));
});
test("architecture guard rejects core network access", () => {
  assert.ok(check({"core/score.js": 'require("node:https");'}).some(x => x.includes("I/O")));
});
test("architecture guard rejects storage depending on HTTP layer", () => {
  assert.ok(check({"storage/store.js": 'require("../web/server.js");', "web/server.js": ""}).some(x => x.includes("Storage crosses")));
});
test("architecture guard rejects circular dependencies", () => {
  assert.ok(check({"storage/a.js": 'require("./b.js");', "storage/b.js": 'require("./a.js");'}).some(x => x.includes("Circular")));
});
test("architecture guard rejects computed module loading and missing targets", () => {
  assert.ok(check({"storage/store.js": 'require(name); require("./missing.js");'}).some(x => x.includes("Unsupported")));
  assert.ok(check({"storage/store.js": 'require("./missing.js");'}).some(x => x.includes("Missing")));
  assert.ok(check({"storage/store.js": 'import database from "pg";'}).some(x => x.includes("Unsupported")));
});
test("architecture guard rejects unregistered and undeclared packages", () => {
  assert.ok(check({}, {devDependencies: {unreviewed: "1.0.0"}}).some(x => x.includes("Unreviewed")));
  assert.ok(check({"storage/store.js": 'require("unreviewed");'}).some(x => x.includes("Undeclared")));
});
test("architecture guard rejects local data and credentials among tracked files", () => {
  for (const name of [".local/training.sqlite", ".env", "nested/.env.production", "output/protocol.json", "input.xlsx", "cert.pem"]) {
    assert.ok(check({[name]: ""}).some(x => x.includes("Forbidden")), name);
  }
  assert.deepEqual(check({".env.example": "", "tests/fixtures/control.json": ""}), []);
});
