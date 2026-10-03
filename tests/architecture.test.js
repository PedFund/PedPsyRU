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
  assert.deepEqual(check({"storage/store.js": 'import database from "pg";'}, {dependencies: {pg: "1.0.0"}}, ["pg"]), []);
});
test("AST imports ignore comments and strings, but follow exports and import types", () => {
  assert.deepEqual(check({"core/a.js": '// require(variable)\nconst s = "require(variable)";'}), []);
  assert.ok(check({"core/a.ts": 'export {x} from "../storage/a.js";', "storage/a.ts": "export const x = 1;"}).some(x => x.includes("crosses boundary")));
  assert.ok(check({"core/a.ts": 'type A = import("../storage/a.js").A;', "storage/a.ts": "export type A = string;"}).some(x => x.includes("crosses boundary")));
});
test("AST guard resolves TS .js imports and rejects cross-layer dependencies", () => {
  assert.deepEqual(check({"src/application/a.ts": 'import type {A} from "../ports/a.js";', "src/ports/a.ts": "export interface A {}"}), []);
  for (const source of ['import {x} from "../adapters/a.js";', 'export * from "../adapters/a.js";', 'const x = import("../adapters/a.js");']) {
    assert.ok(check({"src/application/a.ts": source, "src/adapters/a.ts": "export const x = 1;"}).some(x => x.includes("crosses boundary")));
  }
  assert.ok(check({"src/http/a.ts": 'import {Pool} from "pg";'}, {dependencies: {pg: "1"}}, ["pg"]).some(x => x.includes("HTTP directly")));
});
test("AST guard rejects require aliases, import expressions and dev packages at runtime", () => {
  for (const source of ['const load = require; load(name);', 'module.require(name);', 'require.resolve("pg");', 'import(name);']) {
    assert.ok(check({"src/adapters/a.ts": source}).some(x => x.includes("Unsupported")));
  }
  assert.ok(check({"src/adapters/a.ts": 'import ts from "typescript";'}, {devDependencies: {typescript: "6.0.3"}}, ["typescript"]).some(x => x.includes("Undeclared runtime")));
});
test("AST guard detects TS cycles and rejects tracked build outputs", () => {
  assert.ok(check({"src/application/a.ts": 'import "./b.js";', "src/application/b.ts": 'import "./a.js";'}).some(x => x.includes("Circular")));
  assert.ok(check({"dist/src/http/app.js": ""}).some(x => x.includes("Forbidden")));
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
