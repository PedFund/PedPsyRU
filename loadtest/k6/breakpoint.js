// Breakpoint: stepwise arrival rate of draft saves until the system fails.
// Each VU logs in once, then serves arriving save iterations. abortOnFail stops
// the run at the first threshold breach so the breaking rate is recorded.
import {check, sleep} from "k6";
import {Counter} from "k6/metrics";
import {assertSafeTarget, json, loginParticipant, newSession, request, PASSWORD} from "./lib/common.js";

assertSafeTarget();
const attempts = JSON.parse(open("./fixtures/attempts.json"));
const rejected = new Counter("breakpoint_rejected");

export const options = {
  scenarios: {
    breakpoint: {
      executor: "ramping-arrival-rate",
      startRate: Number(__ENV.START_RATE || "5"),
      timeUnit: "1s",
      preAllocatedVUs: Number(__ENV.PRE_VUS || "50"),
      maxVUs: Number(__ENV.MAX_VUS || "400"),
      stages: [
        {duration: "2m", target: 20},
        {duration: "2m", target: 50},
        {duration: "2m", target: 100},
        {duration: "2m", target: 200},
      ],
    },
  },
  thresholds: {
    http_req_failed: [{threshold: "rate<0.05", abortOnFail: true, delayAbortEval: "30s"}],
    "http_req_duration{name:SaveDraft}": [{threshold: "p(95)<2000", abortOnFail: true, delayAbortEval: "30s"}],
  },
};

let session = null, participant = null, form = null, draft = null, cursor = 0;

export default function () {
  if (!session) {
    participant = attempts[(__VU - 1) % attempts.length];
    session = newSession();
    if (loginParticipant(session, participant.email, PASSWORD).response.status !== 200) { session = null; sleep(1); return; }
    form = json(request(session, "GET", `/api/v2/participant/attempts/${participant.attempt_id}/form`, undefined, {tags: {name: "Form"}}));
    draft = json(request(session, "GET", `/api/v2/participant/attempts/${participant.attempt_id}`, undefined, {tags: {name: "DraftRead"}}));
    if (!form || !draft) { session = null; return; }
  }
  const item = form.items[cursor++ % form.items.length];
  const responses = draft.responses.map(r => ({item_id: r.item_id, value: r.value}));
  const existing = responses.find(r => r.item_id === item.id);
  if (existing) existing.value = item.options[cursor % item.options.length].value;
  else responses.push({item_id: item.id, value: item.options[0].value});
  const saved = request(session, "PUT", `/api/v2/participant/attempts/${participant.attempt_id}/draft`,
    {expected_revision: draft.revision, current_item_id: item.id, responses}, {tags: {name: "SaveDraft"}});
  check(saved, {"draft saved": r => r.status === 200});
  if (saved.status === 200) draft = json(saved);
  else if (saved.status === 409) {
    draft = json(request(session, "GET", `/api/v2/participant/attempts/${participant.attempt_id}`, undefined, {tags: {name: "DraftRead"}}));
  } else rejected.add(1);
}
