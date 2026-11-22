// Spike: 300 participants arrive within 30 seconds. This is the scenario that
// exercises the scrypt admission gate (DerivationGate) and the SQL bucketing.
import {assertSafeTarget} from "./lib/common.js";
import {createExam} from "./lib/exam-scenario.js";

assertSafeTarget();
const VUS = Number(__ENV.VUS || "300");

export const options = {
  scenarios: {
    spike: {
      executor: "ramping-vus", startVUs: 0,
      stages: [
        {duration: "30s", target: VUS},
        {duration: "3m", target: VUS},
        {duration: "30s", target: 0},
      ],
      gracefulRampDown: "30s",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.05"],
    "http_req_duration{name:Login}": ["p(95)<30000"],
  },
};

export default createExam(5, 10, Number(__ENV.OFFSET || "0"));
