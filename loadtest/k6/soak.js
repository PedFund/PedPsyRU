// Soak: 300 participants for a long continuous period. Answers are re-saved
// across the same questionnaires; the draft path, session refresh, audit and
// PostgreSQL stay under sustained load for the whole window.
import {assertSafeTarget} from "./lib/common.js";
import {createExam} from "./lib/exam-scenario.js";

assertSafeTarget();
const VUS = Number(__ENV.VUS || "300");

export const options = {
  scenarios: {
    soak: {
      executor: "ramping-vus", startVUs: 0,
      stages: [
        {duration: "5m", target: VUS},
        {duration: __ENV.HOLD || "30m", target: VUS},
        {duration: "2m", target: 0},
      ],
      gracefulRampDown: "60s",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    "http_req_duration{name:SaveDraft}": ["p(95)<500", "p(99)<1500"],
  },
};

export default createExam(8, 12, Number(__ENV.OFFSET || "0"));
