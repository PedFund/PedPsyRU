// Smoke: one synthetic participant performs the read path and one draft save.
// Run first; it must be green before any load scenario is executed.
import {check, sleep} from "k6";
import {assertSafeTarget, BASE, json, loginParticipant, newSession, request} from "./lib/common.js";

const attempts = JSON.parse(open("./data/attempts.json"));
assertSafeTarget();

export const options = {
  scenarios: {smoke: {executor: "per-vu-iterations", vus: 1, iterations: 2, maxDuration: "2m"}},
  thresholds: {
    http_req_failed: ["rate<0.01"],
    checks: ["rate>0.99"],
    "http_req_duration{name:SaveDraft}": ["p(95)<500"],
  },
};

export default function () {
  // A fresh synthetic account per iteration: the per-account login bucket is
  // intentionally limited to five attempts per 15 minutes.
  const participant = attempts[(__ITER * 7 + 11) % attempts.length];
  const health = request(newSession(), "GET", "/health", undefined, {tags: {name: "Health"}});
  check(health, {"health 200": r => r.status === 200});

  const session = newSession();
  const login = loginParticipant(session, participant.email, participant.password);
  check(login, {"login 200": r => r.response.status === 200, "login csrf": () => Boolean(session.csrf)});
  if (!session.csrf) { sleep(1); return; }

  const current = request(session, "GET", "/api/v2/participant/session", undefined, {tags: {name: "Session"}});
  check(current, {"session 200": r => r.status === 200});
  const form = request(session, "GET", `/api/v2/participant/attempts/${participant.attempt_id}/form`, undefined, {tags: {name: "Form"}});
  check(form, {"form 200": r => r.status === 200});
  const formBody = json(form);
  const draftResponse = request(session, "GET", `/api/v2/participant/attempts/${participant.attempt_id}`, undefined, {tags: {name: "DraftRead"}});
  const draft = json(draftResponse);
  check(draftResponse, {"draft 200": r => r.status === 200});
  if (!formBody || !draft) return;

  const answered = new Set(draft.responses.map(r => r.item_id));
  const item = formBody.items.find(i => !answered.has(i.id)) || formBody.items[0];
  const responses = draft.responses.map(r => ({item_id: r.item_id, value: r.value}));
  if (!answered.has(item.id)) responses.push({item_id: item.id, value: item.options[0].value});
  const saved = request(session, "PUT", `/api/v2/participant/attempts/${participant.attempt_id}/draft`,
    {expected_revision: draft.revision, current_item_id: item.id, responses}, {tags: {name: "SaveDraft"}});
  check(saved, {"draft saved 200": r => r.status === 200});
  console.log(`BASE=${BASE} smoke revision ${draft.revision} -> ${json(saved)?.revision}`);
  sleep(1);
}
