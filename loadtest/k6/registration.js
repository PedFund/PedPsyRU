// Scenario A: mass registration on the current (e-mail confirmation) model.
// Each iteration performs preflight -> context -> start -> receipt -> confirm.
// The synthetic stand returns the confirmation code through /receipt instead of
// sending real mail; no real mailbox receives anything.
import {check, sleep} from "k6";
import {Counter} from "k6/metrics";
import {assertSafeTarget, INVITE, json, newSession, request} from "./lib/common.js";

assertSafeTarget();
const VUS = Number(__ENV.VUS || "20");
const RUN = __ENV.RUN_ID || String(Date.now());
const CONTACT_NOTICE = __ENV.CONTACT_NOTICE || "contact-notice-v3";
const throttled = new Counter("registration_throttled");
const rejected = new Counter("registration_rejected");

export const options = {
  scenarios: {
    registration: {executor: "shared-iterations", vus: VUS, iterations: VUS, maxDuration: __ENV.MAX_DURATION || "10m"},
  },
  thresholds: {
    checks: ["rate>0.98"],
    "http_req_duration{name:RegistrationStart}": ["p(95)<15000"],
    "http_req_duration{name:RegistrationReceipt}": ["p(95)<2000"],
    "http_req_duration{name:RegistrationConfirm}": ["p(95)<2000"],
  },
};

export default function () {
  const index = __VU * 1000 + __ITER;
  const email = `reg-${RUN}-${index}@example.test`;
  const password = "Synthetic-perf-pass-2026";
  const session = newSession();
  session.invite = INVITE;

  const pre = request(session, "GET", "/api/v2/registration/preflight", undefined, {tags: {name: "Preflight"}});
  const preBody = json(pre);
  if (pre.status !== 200 || !preBody) { rejected.add(1); return; }
  session.pendingCsrf = preBody.csrf;

  const context = request(session, "GET", "/api/v2/registration/context", undefined,
    {tags: {name: "RegistrationContext"}, headers: {"x-pedpsy-invite": INVITE}});
  const contextBody = json(context);
  if (context.status !== 200 || !contextBody) { rejected.add(1); return; }
  const notice = contextBody.contact_notice ? contextBody.contact_notice.version : CONTACT_NOTICE;

  const start = request(session, "POST", "/api/v2/registration/start",
    {email, password, contact_notice_version: notice, accept_contact_notice: true},
    {tags: {name: "RegistrationStart"}, csrf: session.pendingCsrf, headers: {"x-pedpsy-invite": INVITE}});
  check(start, {"start accepted": r => r.status === 200});
  if (start.status === 429) { throttled.add(1); return; }
  if (start.status !== 200) { rejected.add(1); return; }

  const receipt = request(session, "POST", "/api/v2/registration/receipt", {},
    {tags: {name: "RegistrationReceipt"}, csrf: session.pendingCsrf, headers: {"x-pedpsy-invite": INVITE}});
  const receiptBody = json(receipt);
  check(receipt, {"receipt delivered": r => r.status === 200});
  if (receipt.status === 429) { throttled.add(1); return; }
  if (receipt.status !== 200 || !receiptBody || !receiptBody.confirmation_token) { rejected.add(1); return; }

  const confirm = request(session, "POST", "/api/v2/registration/confirm", {confirmation_token: receiptBody.confirmation_token},
    {tags: {name: "RegistrationConfirm"}, csrf: session.pendingCsrf, headers: {"x-pedpsy-invite": INVITE}});
  check(confirm, {"registration confirmed": r => r.status === 200});
  if (confirm.status !== 200) rejected.add(1);
  sleep(0.2);
}
