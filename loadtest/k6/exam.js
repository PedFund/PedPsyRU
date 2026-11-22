// Scenario C: 300 participants answer a questionnaire with realistic think
// time. Run with -e VUS=100 / 200 / 300 to get the staged comparison.
import {assertSafeTarget} from "./lib/common.js";
import {createExam} from "./lib/exam-scenario.js";

assertSafeTarget();
const VUS = Number(__ENV.VUS || "300");

export const options = {
  scenarios: {
    exam: {
      executor: "ramping-vus", startVUs: 0,
      stages: [
        {duration: __ENV.RAMP || "5m", target: VUS},
        {duration: __ENV.HOLD || "15m", target: VUS},
        {duration: "1m", target: 0},
      ],
      gracefulRampDown: "30s",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    "http_req_duration{name:SaveDraft}": ["p(95)<500", "p(99)<1500"],
    "http_req_duration{name:Login}": ["p(95)<30000"],
    checks: ["rate>0.99"],
  },
};

export default createExam(Number(__ENV.THINK_MIN || "5"), Number(__ENV.THINK_MAX || "10"), Number(__ENV.OFFSET || "0"));
