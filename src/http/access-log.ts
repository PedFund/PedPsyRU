import {createHmac} from "node:crypto";
import {appendFile} from "node:fs";
import type {FastifyReply, FastifyRequest} from "fastify";

// Access log for incident response: method, route template, status, duration and
// a salted hash of the client address. It deliberately stores no query string, no
// body, no headers and no raw address; the route template cannot contain a token
// or a participant identifier. The log is disabled unless a path is configured,
// and a configured path without a strong salt fails closed at startup.
export interface AccessLogConfig {file: string; salt: string}
export interface AccessLogSink {write(line: string): void}
export function accessLogConfig(env: NodeJS.ProcessEnv): AccessLogConfig | null {
  const file = env.PEDPSY_ACCESS_LOG_PATH?.trim();
  if (!file) return null;
  const salt = env.PEDPSY_ACCESS_LOG_SALT ?? "";
  if (salt.length < 32 || /[^\x21-\x7e]/.test(salt)) throw new Error("ACCESS_LOG_SALT_REQUIRED");
  return {file, salt};
}
export function accessLogLine(input: {method: string; route: string; status: number; durationMs: number; ip: string; salt: string; now: number}): string {
  const ipHash = input.ip ? createHmac("sha256", input.salt).update(input.ip).digest("hex").slice(0, 16) : "";
  return JSON.stringify({ts: new Date(input.now).toISOString(), method: input.method.slice(0, 8), route: input.route.slice(0, 160),
    status: input.status, duration_ms: Math.round(input.durationMs), ip_hash: ipHash}) + "\n";
}
export function createAccessLog(config: AccessLogConfig, sink?: AccessLogSink) {
  return (request: FastifyRequest, reply: FastifyReply): void => {
    const route = (request as unknown as {routeOptions?: {url?: string}}).routeOptions?.url ?? "unmatched";
    const line = accessLogLine({method: request.method, route, status: reply.statusCode, durationMs: reply.elapsedTime ?? 0,
      ip: request.ip, salt: config.salt, now: Date.now()});
    if (sink) { sink.write(line); return; }
    // Logging must never fail a request.
    appendFile(config.file, line, "utf8", () => {});
  };
}
