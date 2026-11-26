// Optional observability port. Adapters call these methods only for counters;
// no SQL text, request body, token or participant data crosses this boundary.
export interface RequestMetricsPort {
  poolWait(ms: number): void;
  queryStarted(): void;
  queryFinished(ms: number, sql: string): void;
  releaseCache(hit: boolean): void;
}
