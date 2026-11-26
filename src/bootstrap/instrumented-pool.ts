import {performance} from "node:perf_hooks";
import type {Pool,PoolClient,QueryResult} from "pg";
import type {RequestMetricsPort} from "../ports/request-metrics.js";

type Connect = (...args: never[]) => Promise<PoolClient>;

// Wrap the pool at its narrow boundary. The application still receives the
// normal pg Pool/PoolClient types; only counters are added.
export function instrumentPool(pool: Pool, metrics: RequestMetricsPort): void {
  const originalConnect = pool.connect.bind(pool) as Connect;
  const patched = new WeakSet<PoolClient>();
  const wrapClient = (client: PoolClient): void => {
    if (patched.has(client)) return;
    patched.add(client);
    const originalQuery = client.query.bind(client) as (...args: unknown[]) => QueryResult | Promise<QueryResult>;
    (client as unknown as {query: (...args: unknown[]) => QueryResult | Promise<QueryResult>}).query = (...args: unknown[]) => {
      const sql = typeof args[0] === "string" ? args[0] : "";
      const started = performance.now();
      metrics.queryStarted();
      let result: QueryResult | Promise<QueryResult>;
      try {
        result = originalQuery(...args);
      } catch (error) {
        metrics.queryFinished(performance.now() - started, sql);
        throw error;
      }
      if (result && typeof (result as Promise<QueryResult>).then === "function") {
        return (result as Promise<QueryResult>).then(value => {
          metrics.queryFinished(performance.now() - started, sql);
          return value;
        }, error => {
          metrics.queryFinished(performance.now() - started, sql);
          throw error;
        });
      }
      metrics.queryFinished(performance.now() - started, sql);
      return result;
    };
  };
  (pool as unknown as {connect: Connect}).connect = (...args: never[]) => {
    const started = performance.now();
    return originalConnect(...args).then(client => {
      metrics.poolWait(performance.now() - started);
      wrapClient(client);
      return client;
    });
  };
}
