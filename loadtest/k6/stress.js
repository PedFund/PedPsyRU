// Stress: same questionnaire flow at ~3x the design request rate (short think
// time) and the full 300 participants. Finds the point where saves stop being
// comfortable, distinct from the breakpoint test's stepwise arrival ramp.
import {assertSafeTarget} from "./lib/common.js";
import {createExam} from "./lib/exam-scenario.js";

assertSafeTarget();
const VUS = Number(__ENV.VUS || "300");

export const options = {
  scenarios: {
    stress: {
      executor: "ramping-vus", startVUs: 0,
      stages: [
        {duration: "2m", target: VUS},
        {duration: __ENV.HOLD || "8m", target: VUS},
        {duration: "1m", target: 0},
      ],
      gracefulRampDown: "30s",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.05"],
    "http_req_duration{name:SaveDraft}": ["p(95)<1500"],
  },
};

export default createExam(1.5, 3, Number(__ENV.OFFSET || "0"));
