// Scenario B: simultaneous e-mail + password login of existing participants.
// Each VU logs in exactly one account (the per-account bucket allows five
// attempts per fifteen minutes, so a login is not repeated inside a run).
import {check} from "k6";
import {Counter} from "k6/metrics";
import {assertSafeTarget, loginParticipant, newSession} from "./lib/common.js";

assertSafeTarget();
const participants = JSON.parse(open("./fixtures/accounts.json"));
const VUS = Number(__ENV.VUS || "200");
const OFFSET = Number(__ENV.OFFSET || "0");
const throttled = new Counter("login_throttled");
const failed = new Counter("login_failed");

export const options = {
  scenarios: {
    // All VUs start together: a true burst, unlike a ramp.
    login: {executor: "per-vu-iterations", vus: VUS, iterations: 1, maxDuration: __ENV.MAX_DURATION || "5m"},
  },
  thresholds: {
    checks: ["rate>0.95"],
    "http_req_duration{name:Login}": ["p(95)<30000"],
    http_req_failed: ["rate<0.02"],
  },
};

export default function () {
  const index = (OFFSET + __VU - 1) % participants.length;
  const participant = participants[index];
  const session = newSession();
  const result = loginParticipant(session, participant.email, participant.password);
  const status = result.response.status;
  check(result, {
    "login 200": r => r.response.status === 200,
    "session csrf issued": () => Boolean(session.csrf),
  });
  if (status === 429) throttled.add(1);
  else if (status !== 200) failed.add(1);
}
