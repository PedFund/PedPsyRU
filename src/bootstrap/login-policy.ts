import {DEFAULT_PARTICIPANT_ADMISSION, type ParticipantAdmissionPolicy} from "../ports/login-policy.js";
// Explicit pilot profile. It is never selected implicitly: PEDPSY_PILOT_LOGIN=1
// is required, every override is range-checked, and without that switch the
// application keeps the historical production admission limits.
const PILOT_GLOBAL_LIMIT = 900;
const PILOT_GLOBAL_WINDOW_MS = 300000;
const PILOT_DERIVATION_CONCURRENCY = 2;
const PILOT_QUEUE_LIMIT = 512;
const PILOT_QUEUE_TIMEOUT_MS = 30000;
const PILOT_VARIABLES = ["PEDPSY_PILOT_LOGIN_LIMIT", "PEDPSY_PILOT_LOGIN_CONCURRENCY"] as const;
function integer(env: NodeJS.ProcessEnv, name: string, fallback: number, min: number, max: number): number {
  const raw = env[name];
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) throw new Error("PILOT_LOGIN_CONFIG_INVALID");
  return value;
}
export function participantAdmissionPolicy(env: NodeJS.ProcessEnv): ParticipantAdmissionPolicy {
  if (env.PEDPSY_PILOT_LOGIN === undefined) {
    if (PILOT_VARIABLES.some(name => env[name] !== undefined)) throw new Error("PILOT_LOGIN_CONFIG_INVALID");
    return DEFAULT_PARTICIPANT_ADMISSION;
  }
  if (env.PEDPSY_PILOT_LOGIN !== "1") throw new Error("PILOT_LOGIN_CONFIG_INVALID");
  return {
    globalLimit: integer(env, "PEDPSY_PILOT_LOGIN_LIMIT", PILOT_GLOBAL_LIMIT, 31, 1200),
    globalWindowMs: PILOT_GLOBAL_WINDOW_MS,
    derivationConcurrency: integer(env, "PEDPSY_PILOT_LOGIN_CONCURRENCY", PILOT_DERIVATION_CONCURRENCY, 1, 4),
    queueLimit: PILOT_QUEUE_LIMIT,
    queueTimeoutMs: PILOT_QUEUE_TIMEOUT_MS
  };
}
