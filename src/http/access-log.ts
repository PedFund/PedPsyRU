import {createHmac} from "node:crypto";
import {appendFile} from "node:fs";
import type {FastifyReply, FastifyRequest} from "fastify";
import type {RequestMetrics, RequestMetricsSnapshot} from "./request-metrics.js";

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
export function accessLogLine(input: {method: string; route: string; status: number; durationMs: number; ip: string; salt: string; now: number; metrics?: RequestMetricsSnapshot}): string {
  const ipHash = input.ip ? createHmac("sha256", input.salt).update(input.ip).digest("hex").slice(0, 16) : "";
  const line: Record<string, unknown> = {ts: new Date(input.now).toISOString(), method: input.method.slice(0, 8), route: input.route.slice(0, 160),
    status: input.status, duration_ms: Math.round(input.durationMs), ip_hash: ipHash};
  if (input.metrics) {
    line.request_id = input.metrics.request_id;
    line.pool_wait_ms = input.metrics.pool_wait_ms;
    line.db_ms = input.metrics.db_ms;
    line.db_queries = input.metrics.db_queries;
    line.db_tx = input.metrics.db_tx;
    line.db_tx_ms = input.metrics.db_tx_ms;
    line.release_cache_hits = input.metrics.release_cache_hits;
    line.release_cache_misses = input.metrics.release_cache_misses;
    line.event_loop_p95_ms = input.metrics.event_loop_p95_ms;
  }
  return JSON.stringify(line) + "\n";
}
export function createAccessLog(config: AccessLogConfig, sink?: AccessLogSink, metrics?: RequestMetrics) {
  return (request: FastifyRequest, reply: FastifyReply): void => {
    const route = (request as unknown as {routeOptions?: {url?: string}}).routeOptions?.url ?? "unmatched";
    const metricsSnapshot = metrics?.snapshot(request);
    const line = accessLogLine({method: request.method, route, status: reply.statusCode, durationMs: reply.elapsedTime ?? 0,
      ip: request.ip, salt: config.salt, now: Date.now(), ...(metricsSnapshot ? {metrics: metricsSnapshot} : {})});
    if (sink) { sink.write(line); return; }
    // Logging must never fail a request.
    appendFile(config.file, line, "utf8", () => {});
  };
}
