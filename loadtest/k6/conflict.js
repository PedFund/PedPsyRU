// Scenario D: concurrent writes on one draft, duplicate replay and a second
// device. One save must win; the duplicate must be refused with 409 without
// inventing a success, and both devices must converge on the server revision.
import http from "k6/http";
import {check} from "k6";
import {Counter} from "k6/metrics";
import {assertSafeTarget, BASE, cookieHeader, JSON_HEADERS, json, loginParticipant, newSession, ORIGIN, request} from "./lib/common.js";

assertSafeTarget();
const attempts = JSON.parse(open("./fixtures/attempts.json"));
const VUS = Number(__ENV.VUS || "20");
const conflicts = new Counter("expected_revision_conflicts");
const duplicates = new Counter("duplicate_write_rejected");
const serverErrors = new Counter("unexpected_server_errors");

export const options = {
  scenarios: {conflict: {executor: "per-vu-iterations", vus: VUS, iterations: 1, maxDuration: "5m"}},
  thresholds: {
    checks: ["rate>0.95"],
    unexpected_server_errors: ["count==0"],
  },
};

export default function () {
  const participant = attempts[(Number(__ENV.OFFSET || "0") + __VU - 1) % attempts.length];
  const first = newSession();
  if (loginParticipant(first, participant.email, participant.password).response.status !== 200) return;

  const path = `/api/v2/participant/attempts/${participant.attempt_id}`;
  const draftResponse = request(first, "GET", path, undefined, {tags: {name: "DraftRead"}});
  const draft = json(draftResponse);
  if (!draft) return;

  const responses = draft.responses.map(r => ({item_id: r.item_id, value: r.value}));
  const formResponse = request(first, "GET", `${path}/form`, undefined, {tags: {name: "Form"}});
  const form = json(formResponse);
  if (!form) return;
  const item = form.items[draft.responses.length % form.items.length];
  const body = {expected_revision: draft.revision, current_item_id: item.id, responses: responses.concat({item_id: item.id, value: item.options[0].value})};

  // Two simultaneous saves of the same draft revision (two tabs / retry storm).
  const pair = http.batch([
    {method: "PUT", url: BASE + `/api/v2/participant/attempts/${participant.attempt_id}/draft`, body: JSON.stringify(body),
      params: {headers: {...JSON_HEADERS, Cookie: cookieHeader(first.cookies), "x-pedpsy-csrf": first.csrf, Origin: ORIGIN}, tags: {name: "ConcurrentSave"}}},
    {method: "PUT", url: BASE + `/api/v2/participant/attempts/${participant.attempt_id}/draft`, body: JSON.stringify(body),
      params: {headers: {...JSON_HEADERS, Cookie: cookieHeader(first.cookies), "x-pedpsy-csrf": first.csrf, Origin: ORIGIN}, tags: {name: "ConcurrentSave"}}},
  ]);
  const created = pair.filter(r => r.status === 200).length;
  const refused = pair.filter(r => r.status === 409).length;
  check(pair, {
    "exactly one save wins": () => created === 1 && refused === 1,
    "no server error in the pair": r => r.status < 500,
  });
  if (refused) conflicts.add(1);
  for (const response of pair) if (response.status >= 500) serverErrors.add(1);

  // Replay of the accepted body after the revision changed: must be refused.
  const replay = request(first, "PUT", `${path}/draft`, body, {tags: {name: "ReplaySave"}});
  check(replay, {"replay refused with 409": r => r.status === 409});
  if (replay.status === 409) duplicates.add(1);
  if (replay.status >= 500) serverErrors.add(1);

  // A second device re-reads the server state; it must see the winning revision.
  const second = newSession();
  if (loginParticipant(second, participant.email, participant.password).response.status === 200) {
    const secondDraft = json(request(second, "GET", path, undefined, {tags: {name: "DraftRead"}}));
    check(secondDraft, {"second device sees newer revision": d => d && d.revision >= draft.revision});
  }
}
