import type {InstrumentResponse,InstrumentResult} from "./instruments.js";
export type {TkiRequest, TkiResponse, TkiResult} from "../../core/tki-contract.js";

// Internal context, created from a verified server session, never a request DTO.
// Constructors/authentication are added with the adapters, not public HTTP inputs.
export interface ParticipantContext {
  readonly realm: "participant";
  readonly actorId: string;
  readonly studyId: string;
  readonly participantId: string;
  readonly sessionId: string;
  readonly sessionVersion: number;
}
export interface DraftInput {
  readonly expected_revision: number;
  readonly current_item_id: string;
  readonly responses: readonly InstrumentResponse[];
}
export interface AttemptSnapshot {
  readonly id: string;
  readonly studyId: string;
  readonly participantId: string;
  readonly releaseId: string;
  readonly status: "draft" | "completed";
  readonly revision: number;
  readonly currentItemId: string;
  readonly responses: readonly InstrumentResponse[];
}
export interface PinnedRelease {
  readonly id: string;
  readonly contractVersion: "1.0";
  readonly methodVersionId: string;
  readonly handlerVersion: string;
  readonly choiceValues?:readonly string[];
  readonly keyDigest: string;
  readonly presentation?:{readonly title?:string;readonly instruction?:string};
  readonly itemIds: readonly string[];
}
export interface StoredResult {
  readonly id: string;
  readonly attemptId: string;
  readonly inputRevision: number;
  readonly responsesDigest: string;
  readonly calculatedAt: string;
  readonly payload: InstrumentResult;
}
export interface AttemptRepository {
  getAuthorized(id: string): Promise<AttemptSnapshot | null>;
  compareAndSave(id: string, input: DraftInput): Promise<AttemptSnapshot>;
  markCompleted(id: string, expectedRevision: number, resultId: string, calculatedAt: string): Promise<void>;
}
export interface ReleaseRepository { getPinned(releaseId: string): Promise<PinnedRelease> }
export interface ResultRepository {
  getExisting(attemptId: string): Promise<StoredResult | null>;
  insertOnce(result: StoredResult): Promise<StoredResult>;
}
export interface AuditEvent {
  readonly event: "draft_read" | "result_read" | "draft_saved" | "attempt_completed";
  readonly resourceId: string;
}
export interface AuditRepository { appendRequired(event: AuditEvent): Promise<void> }
export interface NotificationEvent {
  readonly idempotencyKey: string;
  readonly type: "support_attention";
  readonly supportCaseId: string;
}
export interface OutboxRepository { enqueueOnce(event: NotificationEvent): Promise<void> }
export interface TransactionPorts {
  readonly attempts: AttemptRepository;
  readonly releases: ReleaseRepository;
  readonly results: ResultRepository;
  readonly audit: AuditRepository;
  readonly outbox: OutboxRepository;
}
export interface UnitOfWork {
  run<T>(context: ParticipantContext, callback: (ports: TransactionPorts) => Promise<T>): Promise<T>;
}
