import {participantEmail} from "../ports/contact-email.js";
import type {SmtpOptions} from "../adapters/smtp/transport.js";
// Explicit, disabled-by-default mail configuration. No SMTP variable is read
// unless PEDPSY_MAIL_ENABLED=1, and real sending additionally requires the
// already-approved real-email pilot mode. Invalid combinations fail closed.
export interface MailDeliveryConfig {
  readonly smtp: SmtpOptions;
  readonly batch: number;
  readonly pollMs: number;
  readonly allowlist: ReadonlySet<string> | null;
}
const MAIL_VARIABLES = [
  "PEDPSY_SMTP_HOST", "PEDPSY_SMTP_PORT", "PEDPSY_SMTP_USER", "PEDPSY_SMTP_PASSWORD",
  "PEDPSY_MAIL_FROM", "PEDPSY_MAIL_FROM_NAME", "PEDPSY_MAIL_REPLY_TO", "PEDPSY_MAIL_ALLOWLIST",
  "PEDPSY_MAIL_BATCH", "PEDPSY_MAIL_POLL_MS"
] as const;
function invalid(): never { throw new Error("MAIL_CONFIG_INVALID"); }
function text(env: NodeJS.ProcessEnv, name: string, min: number, max: number): string {
  const value = env[name];
  if (typeof value !== "string" || value.length < min || value.length > max || /[\u0000-\u001f\u007f]/.test(value)) invalid();
  return value;
}
function integer(env: NodeJS.ProcessEnv, name: string, fallback: number, min: number, max: number): number {
  const raw = env[name];
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) invalid();
  return value;
}
function address(value: string): string {
  try { return participantEmail(value); } catch { return invalid(); }
}
export function mailDeliveryConfig(env: NodeJS.ProcessEnv): MailDeliveryConfig | null {
  if (env.PEDPSY_MAIL_ENABLED === undefined) {
    if (MAIL_VARIABLES.some(name => env[name] !== undefined)) invalid();
    return null;
  }
  if (env.PEDPSY_MAIL_ENABLED !== "1") invalid();
  if (env.PEDPSY_PILOT_REAL_EMAIL !== "1") throw new Error("MAIL_REAL_EMAIL_REQUIRED");
  const host = env.PEDPSY_SMTP_HOST ?? "smtp.mail.selcloud.ru";
  if (!/^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$/i.test(host)) invalid();
  const port = integer(env, "PEDPSY_SMTP_PORT", 1127, 1, 65535);
  if (port !== 1127 && port !== 465) invalid();
  const user = text(env, "PEDPSY_SMTP_USER", 1, 254);
  const password = text(env, "PEDPSY_SMTP_PASSWORD", 1, 512);
  const from = address(text(env, "PEDPSY_MAIL_FROM", 3, 254));
  const fromName = env.PEDPSY_MAIL_FROM_NAME === undefined ? undefined : text(env, "PEDPSY_MAIL_FROM_NAME", 1, 100);
  const replyTo = env.PEDPSY_MAIL_REPLY_TO === undefined ? undefined : address(text(env, "PEDPSY_MAIL_REPLY_TO", 3, 254));
  let allowlist: ReadonlySet<string> | null = null;
  if (env.PEDPSY_MAIL_ALLOWLIST !== undefined) {
    const raw = env.PEDPSY_MAIL_ALLOWLIST.split(",").map(value => value.trim());
    if (raw.some(value => !value)) invalid();
    const entries = raw.map(address);
    allowlist = new Set(entries);
  }
  const batch = integer(env, "PEDPSY_MAIL_BATCH", 10, 1, 20);
  const pollMs = integer(env, "PEDPSY_MAIL_POLL_MS", 2000, 500, 60000);
  return {
    smtp: {host, port, tls: "implicit", user, password, from, ...(fromName ? {fromName} : {}), ...(replyTo ? {replyTo} : {}), timeoutMs: 15000},
    batch,
    pollMs,
    allowlist
  };
}
