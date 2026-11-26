import {AsyncLocalStorage} from "node:async_hooks";
import {randomUUID} from "node:crypto";
import {monitorEventLoopDelay, type IntervalHistogram} from "node:perf_hooks";
import type {FastifyReply,FastifyRequest,HookHandlerDoneFunction} from "fastify";

export interface RequestMetricsSnapshot {
  readonly request_id: string;
  readonly pool_wait_ms: number;
  readonly db_ms: number;
  readonly db_queries: number;
  readonly db_tx: number;
  readonly db_tx_ms: number;
  readonly release_cache_hits: number;
  readonly release_cache_misses: number;
  readonly event_loop_p95_ms: number;
}

interface ActiveMetrics {
  readonly request_id: string;
  poolWaitMs: number;
  dbMs: number;
  dbQueries: number;
  dbTx: number;
  dbTxMs: number;
  txStartedAt: number | null;
  releaseHits: number;
  releaseMisses: number;
}

// Per-request metrics travel through AsyncLocalStorage, so the pool adapter and
// the unit of work do not need to know which Fastify request owns a connection.
// Only counters and durations are exposed; SQL text, parameters, bodies and
// addresses never enter this object.
export class RequestMetrics {
  private readonly storage = new AsyncLocalStorage<ActiveMetrics>();
  private readonly requests = new WeakMap<object, ActiveMetrics>();
  private readonly loopDelay: IntervalHistogram;
  private readonly startedAt = performance.now();

  constructor() {
    this.loopDelay = monitorEventLoopDelay({resolution: 20});
  }

  onRequest = (request: FastifyRequest, reply: FastifyReply, done: HookHandlerDoneFunction): void => {
    const active: ActiveMetrics = {
      request_id: randomUUID(), poolWaitMs: 0, dbMs: 0, dbQueries: 0, dbTx: 0, dbTxMs: 0,
      txStartedAt: null, releaseHits: 0, releaseMisses: 0
    };
    this.requests.set(request, active);
    reply.header("X-Request-ID", active.request_id);
    this.storage.run(active, done);
  };

  snapshot(request?: FastifyRequest): RequestMetricsSnapshot | undefined {
    const active = request ? this.requests.get(request) : this.storage.getStore();
    if (!active) return undefined;
    const elapsed = performance.now() - this.startedAt;
    return {
      request_id: active.request_id,
      pool_wait_ms: Math.round(active.poolWaitMs),
      db_ms: Math.round(active.dbMs),
      db_queries: active.dbQueries,
      db_tx: active.dbTx,
      db_tx_ms: Math.round(active.dbTxMs),
      release_cache_hits: active.releaseHits,
      release_cache_misses: active.releaseMisses,
      // The histogram is process-wide; it is intentionally not reset per
      // request, so it remains a useful saturation signal across a load run.
      event_loop_p95_ms: elapsed > 0 ? Math.round(this.loopDelay.percentile(95) / 1e6 * 100) / 100 : 0
    };
  }

  poolWait(ms: number): void {
    const active = this.storage.getStore();
    if (active) active.poolWaitMs += Math.max(0, ms);
  }

  queryStarted(): void {
    const active = this.storage.getStore();
    if (active) active.dbQueries++;
  }

  queryFinished(ms: number, sql: string): void {
    const active = this.storage.getStore();
    if (!active) return;
    active.dbMs += Math.max(0, ms);
    const command = sql.trim().slice(0, 16).toUpperCase();
    if (command === "BEGIN" || command.startsWith("BEGIN")) {
      active.txStartedAt = performance.now();
      active.dbTx++;
    } else if ((command === "COMMIT" || command.startsWith("COMMIT") || command === "ROLLBACK" || command.startsWith("ROLLBACK")) && active.txStartedAt !== null) {
      active.dbTxMs += Math.max(0, performance.now() - active.txStartedAt);
      active.txStartedAt = null;
    }
  }

  releaseCache(hit: boolean): void {
    const active = this.storage.getStore();
    if (!active) return;
    if (hit) active.releaseHits++;
    else active.releaseMisses++;
  }

  close(): void {
    this.loopDelay.disable();
  }
}
