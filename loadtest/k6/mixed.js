// Scenario E: mixed load. 200 registrations, 100 logins and 300 questionnaire
// participants at the same time. The question under test: does mass registration
// delay or break answer saving for participants who are already working?
import {check, sleep} from "k6";
import {Counter} from "k6/metrics";
import {assertSafeTarget, INVITE, json, loginParticipant, newSession, request} from "./lib/common.js";
import {createExam} from "./lib/exam-scenario.js";

assertSafeTarget();
const participants = JSON.parse(open("./data/accounts.json"));
const RUN = __ENV.RUN_ID || String(Date.now());
const registrationThrottled = new Counter("mixed_registration_throttled");
const loginThrottled = new Counter("mixed_login_throttled");
const examFlow = createExam(5, 10, 0);

export const options = {
  scenarios: {
    registration: {executor: "shared-iterations", exec: "registrationFlow", vus: Number(__ENV.REG_VUS || "200"),
      iterations: Number(__ENV.REG_VUS || "200"), startTime: "0s", maxDuration: "15m"},
    login: {executor: "per-vu-iterations", exec: "loginFlow", vus: Number(__ENV.LOGIN_VUS || "100"),
      iterations: 1, startTime: "10s", maxDuration: "5m"},
    exam: {executor: "ramping-vus", exec: "examIteration", startVUs: 0,
      stages: [{duration: "5m", target: Number(__ENV.EXAM_VUS || "300")},
        {duration: __ENV.HOLD || "10m", target: Number(__ENV.EXAM_VUS || "300")},
        {duration: "1m", target: 0}],
      startTime: "20s", gracefulRampDown: "30s"},
  },
  thresholds: {
    // Registration at 200 is expected to hit the receipt bucket; the threshold
    // covers the approved failure mode instead of pretending it does not exist.
    "http_req_duration{name:SaveDraft}": ["p(95)<1000"],
    "http_req_duration{name:Login}": ["p(95)<30000"],
    checks: ["rate>0.95"],
  },
};

export function registrationFlow() {
  const index = __VU * 1000 + __ITER;
  const email = `mixed-${RUN}-${index}@example.test`;
  const password = "Synthetic-perf-pass-2026";
  const session = newSession();
  const pre = request(session, "GET", "/api/v2/registration/preflight", undefined, {tags: {name: "Preflight"}});
  const preBody = json(pre);
  if (pre.status !== 200 || !preBody) return;
  session.pendingCsrf = preBody.csrf;
  const context = json(request(session, "GET", "/api/v2/registration/context", undefined,
    {tags: {name: "RegistrationContext"}, headers: {"x-pedpsy-invite": INVITE}}));
  if (!context) return;
  const start = request(session, "POST", "/api/v2/registration/start",
    {email, password, contact_notice_version: context.contact_notice.version, accept_contact_notice: true},
    {tags: {name: "RegistrationStart"}, csrf: session.pendingCsrf, headers: {"x-pedpsy-invite": INVITE}});
  if (start.status === 429) { registrationThrottled.add(1); return; }
  check(start, {"start accepted": r => r.status === 200});
  if (start.status !== 200) return;
  const receipt = request(session, "POST", "/api/v2/registration/receipt", {},
    {tags: {name: "RegistrationReceipt"}, csrf: session.pendingCsrf, headers: {"x-pedpsy-invite": INVITE}});
  const receiptBody = json(receipt);
  if (receipt.status === 429) { registrationThrottled.add(1); return; }
  if (receipt.status !== 200 || !receiptBody || !receiptBody.confirmation_token) return;
  const confirm = request(session, "POST", "/api/v2/registration/confirm", {confirmation_token: receiptBody.confirmation_token},
    {tags: {name: "RegistrationConfirm"}, csrf: session.pendingCsrf, headers: {"x-pedpsy-invite": INVITE}});
  check(confirm, {"confirmed": r => r.status === 200});
}
export function loginFlow() {
  const participant = participants[(__VU - 1) % participants.length];
  const session = newSession();
  const result = loginParticipant(session, participant.email, participant.password);
  if (result.response.status === 429) loginThrottled.add(1);
  check(result, {"login 200": r => r.response.status === 200});
}
export function examIteration() { examFlow(); }
