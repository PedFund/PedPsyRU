// Pilot profile: 200 simultaneous independent sessions.
// 60 incoming participants + 140 participants already answering, 20-minute plateau.
// Every VU gets a distinct synthetic account and attempt; try 250 only as an
// optional capacity check, never by sharing sessions.
import {check, sleep} from "k6";
import {Counter} from "k6/metrics";
import {assertSafeTarget, json, loginParticipant, newSession, PASSWORD, request} from "./lib/common.js";
import {createExam} from "./lib/exam-scenario.js";

assertSafeTarget();
const accounts = JSON.parse(open("./fixtures/accounts.json"));
const allAttempts = JSON.parse(open("./fixtures/attempts.json"));
const unique = [];
const seen = new Set();
for (const attempt of allAttempts) {
  if (seen.has(attempt.email)) continue;
  seen.add(attempt.email);
  unique.push(attempt);
}
if (unique.length < 200 || accounts.length < 200) {
  throw new Error(`NEED_200_UNIQUE_ACCOUNTS accounts=${accounts.length} attempts=${unique.length}`);
}
const examAttempts = unique.slice(0, 140);
const incomingAttempts = unique.slice(140, 200);
const unexpected = new Counter("unexpected_server_errors");
const examFlow = createExam(5, 10, 0, examAttempts);

export const options = {
  scenarios: {
    incoming: {
      executor: "constant-vus", exec: "incomingIteration", vus: 60, duration: "26m", startTime: "0s",
    },
    exam: {
      executor: "ramping-vus", exec: "examIteration", startVUs: 0,
      stages: [{duration: "5m", target: 140}, {duration: "20m", target: 140}, {duration: "1m", target: 0}],
      startTime: "0s", gracefulRampDown: "30s",
    },
  },
  thresholds: {
    "http_req_failed": ["rate<0.001"],
    "http_req_duration{name:Login}": ["p(95)<2000", "p(99)<4000"],
    "http_req_duration{name:Form}": ["p(95)<2000"],
    "http_req_duration{name:Stages}": ["p(95)<2000"],
    "http_req_duration{name:DraftRead}": ["p(95)<2000"],
    "http_req_duration{name:SaveDraft}": ["p(95)<1500", "p(99)<4000"],
    checks: ["rate>0.99"],
    "unexpected_server_errors": ["count==0"],
  },
};

function incomingIteration() {
  const index = (__VU - 1) % incomingAttempts.length;
  const participant = incomingAttempts[index];
  const session = newSession();
  const login = loginParticipant(session, participant.email, PASSWORD);
  check(login, {"login 200": r => r.response.status === 200});
  if (login.response.status >= 500) unexpected.add(1);
  if (login.response.status !== 200) return;
  const stages = request(session, "GET", "/api/v2/participant/stages", undefined, {tags: {name: "Stages"}});
  check(stages, {"stages 200": r => r.status === 200});
  if (stages.status >= 500) unexpected.add(1);
  const form = request(session, "GET", `/api/v2/participant/attempts/${participant.attempt_id}/form`, undefined, {tags: {name: "Form"}});
  check(form, {"form 200": r => r.status === 200});
  if (form.status >= 500) unexpected.add(1);
  sleep(60 + Math.random() * 180);
}

export function examIteration() {
  examFlow();
}
