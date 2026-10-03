"use strict";
const assert = require("node:assert/strict");
const {test} = require("node:test");
const http = require("node:http");
const {createDemoServer, MAX_BODY_BYTES} = require("../web/server.js");
const {buildRequest} = require("../web/form-model.js");
const form = require("../methods/tki/form.json");
const fixtures = require("./fixtures/tki-reference.json");

async function setup(t) {
  const server = createDemoServer();
  await new Promise((resolve, reject) => {server.once("error", reject); server.listen(0, "127.0.0.1", resolve);});
  t.after(async () => {server.closeAllConnections(); await new Promise(resolve => server.close(resolve));});
  const base = "http://127.0.0.1:" + server.address().port;
  const metadata = await (await fetch(base + "/api/form")).json();
  const request = (answers = "A".repeat(30)) => buildRequest(form.items, Object.fromEntries(form.items.map((item, i) => [item.id, answers[i]])), metadata.versions);
  const post = input => fetch(base + "/api/score", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(input)});
  return {base, metadata, request, post};
}

test("browser receives all 30 pairs and current versions but no key or source text", async t => {
  const {metadata} = await setup(t);
  assert.equal(metadata.demo, true);
  assert.equal(metadata.persistence, false);
  assert.equal(metadata.versions.method_version_id, "tki_ru_30_pairs@1.0.0");
  assert.equal(metadata.versions.handler_version, "tki-contract-0.3.0");
  assert.deepEqual(metadata.form.items, form.items.map(item => ({id: item.id, number: item.number, options: item.options.map(({value, label, text}) => ({value, label, text}))})));
  assert.equal(JSON.stringify(metadata).includes("source_text"), false);
  assert.equal(JSON.stringify(metadata).includes("scales"), false);
});

test("static assets load with safe headers; filesystem and key are not exposed", async t => {
  const {base} = await setup(t);
  for (const url of ["/", "/app.js", "/form-model.js", "/styles.css"]) {
    const response = await fetch(base + url);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.match(response.headers.get("content-security-policy"), /frame-ancestors 'none'/);
    assert.ok((await response.text()).length > 0);
  }
  for (const url of ["/methods/tki/keys/1.0.0.json", "/processor.js", "/package.json", "/%2e%2e%2fpackage.json"]) assert.equal((await fetch(base + url)).status, 404);
});

test("full profiles pass through HTTP into the existing verified handler", async t => {
  const {request, post} = await setup(t);
  for (const profile of fixtures.profiles) {
    const response = await post(request(profile.answers));
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.persistence, false);
    assert.equal(payload.result.status, "scored");
    assert.deepEqual(payload.result.measures.map(measure => measure.value), profile.expected);
    assert.equal("responses" in payload, false);
  }
});

test("incomplete and duplicate responses return no scores over HTTP", async t => {
  const {request, post} = await setup(t);
  for (const change of [input => input.responses.pop(), input => input.responses.push(input.responses[0])]) {
    const input = request(); change(input);
    const response = await post(input);
    assert.equal(response.status, 422);
    const payload = await response.json();
    assert.deepEqual(payload.result.measures, []);
    assert.equal(payload.result.quality.usable_for_aggregation, false);
  }
});

test("obsolete versions and noncanonical answers remain blocked at the HTTP boundary", async t => {
  const {request, post} = await setup(t);
  const obsolete = request(); obsolete.method_version_id = "tki_ru_30_pairs@legacy-5.5.8-draft";
  const invalid = request(); invalid.responses[0].value = "А";
  for (const input of [obsolete, invalid]) {
    const response = await post(input);
    assert.equal(response.status, 422);
    assert.deepEqual((await response.json()).result.measures, []);
  }
});

test("invalid JSON and unsupported content type are rejected without echoing answers", async t => {
  const {base} = await setup(t);
  const invalid = await fetch(base + "/api/score", {method: "POST", headers: {"Content-Type": "application/json"}, body: "not json"});
  assert.equal(invalid.status, 400);
  assert.deepEqual(await invalid.json(), {error: "INVALID_JSON"});
  const wrongType = await fetch(base + "/api/score", {method: "POST", body: "private answers"});
  assert.equal(wrongType.status, 415);
  assert.deepEqual(await wrongType.json(), {error: "JSON_REQUIRED"});
});

test("oversized request is rejected", async t => {
  const {base} = await setup(t);
  const response = await fetch(base + "/api/score", {method: "POST", headers: {"Content-Type": "application/json"}, body: "x".repeat(MAX_BODY_BYTES + 1)});
  assert.equal(response.status, 413);
  assert.deepEqual(await response.json(), {error: "BODY_TOO_LARGE"});
});

test("cross-origin, cross-site and nonlocal host requests are rejected", async t => {
  const {base} = await setup(t);
  for (const headers of [{Origin: "https://other.example"}, {"Sec-Fetch-Site": "cross-site"}, {Host: "other.example"}]) {
    // fetch controls some browser metadata headers; send exact headers via HTTP.
    const status = await new Promise((resolve, reject) => {
      const request = http.get(base + "/api/form", {headers}, response => {
        response.resume(); response.on("end", () => resolve(response.statusCode));
      });
      request.on("error", reject);
    });
    assert.equal(status, 403, JSON.stringify(headers));
  }
});

test("method and unknown-route boundaries do not provide persistence endpoints", async t => {
  const {base} = await setup(t);
  assert.equal((await fetch(base + "/api/score")).status, 405);
  assert.equal((await fetch(base + "/api/form", {method: "POST"})).status, 405);
  assert.equal((await fetch(base + "/api/responses", {method: "POST"})).status, 404);
});
