// Completion: finishes attempts that were filled by exam.js and verifies the
// result is scored by the pinned handler. Run after the exam/soak scenario.
import {check, sleep} from "k6";
import {Counter} from "k6/metrics";
import {assertSafeTarget, json, loginParticipant, newSession, request} from "./lib/common.js";

assertSafeTarget();
const attempts = JSON.parse(open("./data/attempts.json"));
const VUS = Number(__ENV.VUS || "100");
const scored = new Counter("attempts_scored");
const incomplete = new Counter("attempts_incomplete");

export const options = {
  scenarios: {completion: {executor: "per-vu-iterations", vus: VUS, iterations: 1, maxDuration: "10m"}},
  thresholds: {
    checks: ["rate>0.98"],
    "http_req_duration{name:Complete}": ["p(95)<3000"],
  },
};

export default function () {
  const participant = attempts[(Number(__ENV.OFFSET || "0") + __VU - 1) % attempts.length];
  const session = newSession();
  if (loginParticipant(session, participant.email, participant.password).response.status !== 200) return;
  const path = `/api/v2/participant/attempts/${participant.attempt_id}`;
  let draft = json(request(session, "GET", path, undefined, {tags: {name: "DraftRead"}}));
  if (!draft) return;
  if (draft.status === "completed") {
    const existing = request(session, "GET", `${path}/result`, undefined, {tags: {name: "ResultRead"}});
    check(existing, {"existing result readable": r => r.status === 200});
    return;
  }
  if (draft.responses.length < (participant.item_ids || []).length) { incomplete.add(1); return; }
  const completed = request(session, "POST", `${path}/complete`, {expected_revision: draft.revision}, {tags: {name: "Complete"}});
  const ok = check(completed, {"complete 200": r => r.status === 200});
  if (completed.status === 409) {
    // Lost a race with a concurrent completion: the stored result must be readable.
    const result = request(session, "GET", `${path}/result`, undefined, {tags: {name: "ResultRead"}});
    check(result, {"result after conflict": r => r.status === 200});
    return;
  }
  if (!ok) return;
  const body = json(completed);
  check(body, {
    "payload is scored": b => b && b.status === "scored",
    "responses digest present": b => b && typeof b.responses_digest === "string" && b.responses_digest.length > 0,
  });
  if (body && body.status === "scored") scored.add(1);
  const result = request(session, "GET", `${path}/result`, undefined, {tags: {name: "ResultRead"}});
  check(result, {"stored result matches": r => r.status === 200 && json(r) && json(r).result_id === body.result_id});
  sleep(0.5);
}
