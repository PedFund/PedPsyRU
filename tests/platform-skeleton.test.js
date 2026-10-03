"use strict";
const {test} = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {createPlatformApp} = require("../dist/src/http/app.js");
const {calculatePinnedTki} = require("../dist/src/scoring/tki.js");
const {scoreTki, CONTRACT_VERSION, METHOD_VERSION_ID, HANDLER_VERSION} = require("../core/tki-contract.js");
test("typed scorer matches original for all A/B profiles and single flips", () => {
  for (const base of ["A", "B"]) for (let flip = -1; flip < 30; flip++) {
    const request = {contract_version: CONTRACT_VERSION, method_version_id: METHOD_VERSION_ID, handler_version: HANDLER_VERSION,
      responses: Array.from({length: 30}, (_, i) => ({item_id: "q" + String(i + 1).padStart(2, "0"), value: i === flip ? (base === "A" ? "B" : "A") : base}))};
    assert.deepEqual(calculatePinnedTki(request), scoreTki(request));
  }
});
test("build preserves original scorer and imported artifacts byte-for-byte", () => {
  const root = path.resolve(__dirname, "..");
  for (const file of ["core/tki-contract.js", "processor.js", "methods.js", "methods/builtin.js", "methods/tki/keys/1.0.0.json"]) {
    assert.deepEqual(fs.readFileSync(path.join(root, "dist", file)), fs.readFileSync(path.join(root, file)), file);
  }
});
test("health has bounded schema, no cache and no data endpoints", async t => {
  const app = createPlatformApp(); t.after(() => app.close());
  const response = await app.inject({method: "GET", url: "/health"});
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {status: "ok"});
  assert.equal(response.headers["cache-control"], "no-store");
  assert.equal(response.headers["x-content-type-options"], "nosniff");
  for (const url of ["/api/participant/attempts", "/api/admin/results", "/api/methods", "/training.sqlite"]) {
    assert.equal((await app.inject({method: "GET", url})).statusCode, 404);
  }
});
test("HTTP errors never expose thrown exception or payload", async t => {
  const app = createPlatformApp(); t.after(() => app.close());
  app.get("/test-failure", async () => {throw new Error("synthetic private payload");});
  const response = await app.inject({method: "GET", url: "/test-failure"});
  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.json(), {error: "INTERNAL_ERROR"});
  assert.ok(!response.body.includes("private"));
});
