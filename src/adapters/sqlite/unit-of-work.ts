import type {DatabaseSync} from "node:sqlite";
import {AsyncLocalStorage} from "node:async_hooks";
import {randomUUID} from "node:crypto";
import {releasePackage, canonicalJson} from "../../../storage/releases.js";
import {ParticipationError} from "../../ports/errors.js";
import {validateDraft} from "../../ports/validation.js";
import type {TkiResponse, TkiResult} from "../../../core/tki-contract.js";
import type {UnitOfWork, ParticipantContext, TransactionPorts, AttemptSnapshot, StoredResult, PinnedRelease} from "../../ports/participation.js";

interface Actor {credential_id: string; study_id: string; participant_id: string; token_hash: string}
interface SessionAuthority {
  requireSession(token: string): Actor;
  requireAttempt(token: string, id: string): {actor: Actor; attempt: {attempt_id: string; status: "draft" | "completed"; revision: number; current_item_id: string; release_id: string}};
}
// A dedicated synthetic connection: do not share with synchronous pilot stores.
export class SqliteUnitOfWork implements UnitOfWork {
  private readonly contexts = new WeakMap<ParticipantContext, string>();
  private readonly local = new AsyncLocalStorage<boolean>();
  private tail: Promise<void> = Promise.resolve();
  constructor(private readonly db: DatabaseSync, private readonly authority: SessionAuthority, private readonly now = Date.now) {}
  context(token: string): ParticipantContext {
    if (this.db.isTransaction) throw new Error("TRANSACTION_ACTIVE");
    const actor = this.authority.requireSession(token);
    const row = this.db.prepare("SELECT credential_version FROM participant_sessions WHERE token_hash=?").get(actor.token_hash)!;
    const context: ParticipantContext = Object.freeze({realm: "participant", actorId: actor.credential_id,
      studyId: actor.study_id, participantId: actor.participant_id, sessionId: actor.token_hash, sessionVersion: Number(row.credential_version)});
    this.contexts.set(context, token); return context;
  }
  async run<T>(context: ParticipantContext, callback: (ports: TransactionPorts) => Promise<T>): Promise<T> {
    if (this.local.getStore()) throw new Error("NESTED_TRANSACTION");
    const token = this.contexts.get(context);
    if (!token) throw new ParticipationError(401, "AUTH_REQUIRED");
    const previous = this.tail;
    let unlock!: () => void;
    this.tail = new Promise<void>(resolve => {unlock = resolve;});
    await previous;
    let active = false;
    try {
      if (this.db.isTransaction) throw new Error("TRANSACTION_ACTIVE");
      this.db.exec("BEGIN IMMEDIATE"); active = true;
      return await this.local.run(true, async () => {
        let open = true;
        const ensure = (): Actor => {
          if (!open) throw new Error("TRANSACTION_CLOSED");
          const actor = this.authority.requireSession(token);
          if (actor.credential_id !== context.actorId || actor.study_id !== context.studyId || actor.participant_id !== context.participantId)
            throw new ParticipationError(401, "AUTH_REQUIRED");
          return actor;
        };
        const authorized = new Map<string, AttemptSnapshot>();
        const pendingAudit = new Set<string>();
        const get = (id: string): AttemptSnapshot => {
          ensure(); const {actor, attempt} = this.authority.requireAttempt(token, id);
          const responses = this.db.prepare("SELECT item_id,value FROM responses WHERE study_id=? AND attempt_id=? ORDER BY item_id")
            .all(actor.study_id, id) as unknown as TkiResponse[];
          const snapshot: AttemptSnapshot = {id, studyId: actor.study_id, participantId: actor.participant_id,
            releaseId: attempt.release_id, status: attempt.status, revision: attempt.revision, currentItemId: attempt.current_item_id, responses};
          authorized.set(id, snapshot); return snapshot;
        };
        const pinned = (id: string): PinnedRelease => {
          ensure(); if (![...authorized.values()].some(a => a.releaseId === id)) throw new ParticipationError(404, "NOT_AVAILABLE");
          const row = this.db.prepare("SELECT * FROM instrument_releases WHERE id=?").get(id);
          const pkg = releasePackage();
          const items = this.db.prepare("SELECT item_id,ordinal,options FROM release_items WHERE release_id=? ORDER BY ordinal").all(id);
          if (!row || row.form_snapshot !== pkg.formSnapshot || row.form_digest !== pkg.formDigest || row.key_digest !== pkg.keyDigest ||
            row.form_id !== pkg.form.id || row.form_version !== pkg.form.version || row.verification_state !== "key_verified" ||
            row.contract_version !== "1.0" || row.method_version_id !== "tki_ru_30_pairs@1.0.0" || row.handler_version !== "tki-contract-0.3.0" ||
            items.length !== 30 || items.some((item, i) => item.item_id !== pkg.form.items[i]?.id || item.ordinal !== i + 1 || item.options !== canonicalJson(pkg.form.items[i]?.options)))
            throw new ParticipationError(503, "RELEASE_UNAVAILABLE");
          return {id, contractVersion: "1.0", methodVersionId: "tki_ru_30_pairs@1.0.0", handlerVersion: "tki-contract-0.3.0",
            keyDigest: pkg.keyDigest, itemIds: items.map(item => String(item.item_id))};
        };
        const existing = (id: string): StoredResult | null => {
          get(id); const row = this.db.prepare("SELECT * FROM attempt_results WHERE study_id=? AND attempt_id=?").get(context.studyId, id);
          return row ? {id: String(row.id), attemptId: id, inputRevision: Number(row.input_revision),
            responsesDigest: String(row.responses_digest), calculatedAt: String(row.calculated_at), payload: JSON.parse(String(row.payload)) as TkiResult} : null;
        };
        const ports: TransactionPorts = {
          attempts: {
            getAuthorized: async id => get(id),
            compareAndSave: async (id, input) => {
              const state = get(id); const release = pinned(state.releaseId); validateDraft(input, release.itemIds);
              if (state.status !== "draft") throw new ParticipationError(409, "ATTEMPT_COMPLETED");
              if (state.revision !== input.expected_revision) throw new ParticipationError(409, "REVISION_CONFLICT");
              const update = this.db.prepare("UPDATE attempts SET current_item_id=?,revision=revision+1,updated_at=? WHERE id=? AND study_id=? AND status='draft' AND revision=?")
                .run(input.current_item_id, new Date(this.now()).toISOString(), id, context.studyId, input.expected_revision);
              if (update.changes !== 1) throw new ParticipationError(409, "REVISION_CONFLICT");
              this.db.prepare("DELETE FROM responses WHERE study_id=? AND attempt_id=?").run(context.studyId, id);
              const insert = this.db.prepare("INSERT INTO responses(study_id,attempt_id,release_id,item_id,value) VALUES(?,?,?,?,?)");
              for (const response of input.responses) insert.run(context.studyId, id, state.releaseId, response.item_id, response.value);
              pendingAudit.add(id + ":draft_saved");
              return get(id);
            },
            markCompleted: async (id, revision, resultId, at) => {
              const state = get(id);
              if (state.status !== "draft" || state.revision !== revision) throw new ParticipationError(409, "REVISION_CONFLICT");
              const changed = this.db.prepare("UPDATE attempts SET status='completed',revision=revision+1,completion_result_id=?,completed_at=?,updated_at=? WHERE id=? AND study_id=? AND status='draft' AND revision=?")
                .run(resultId, at, at, id, context.studyId, revision);
              if (changed.changes !== 1) throw new ParticipationError(409, "REVISION_CONFLICT");
              pendingAudit.add(id + ":attempt_completed");
            }
          },
          releases: {getPinned: async id => pinned(id)},
          results: {
            getExisting: async id => existing(id),
            insertOnce: async result => {
              const state = get(result.attemptId), saved = existing(result.attemptId);
              if (saved) return saved;
              this.db.prepare("INSERT INTO attempt_results(id,study_id,attempt_id,release_id,input_revision,responses_digest,contract_version,handler_version,key_digest,calculated_at,payload) VALUES(?,?,?,?,?,?,?,?,?,?,?)")
                .run(result.id, context.studyId, state.id, state.releaseId, result.inputRevision, result.responsesDigest,
                  result.payload.contract_version, result.payload.handler_version, result.payload.calculation.key_digest, result.calculatedAt, JSON.stringify(result.payload));
              return result;
            }
          },
          audit: {appendRequired: async event => {
            const actor = ensure(); get(event.resourceId);
            this.db.prepare("INSERT INTO access_audit_events(id,at_ms,credential_id,study_id,action,outcome,reason,resource_id) VALUES(?,?,?,?,?,'allow','OWN_SCOPE',?)")
              .run(randomUUID(), this.now(), actor.credential_id, actor.study_id, event.event, event.resourceId);
            pendingAudit.delete(event.resourceId + ":" + event.event);
          }},
          outbox: {enqueueOnce: async () => {ensure(); throw new Error("OUTBOX_NOT_IMPLEMENTED");}}
        };
        try {
          ensure(); const result = await callback(ports); ensure();
          if (pendingAudit.size) throw new Error("MANDATORY_AUDIT_MISSING");
          this.db.exec("COMMIT"); active = false; return result;
        } finally {open = false;}
      });
    } catch (error) {if (active && this.db.isTransaction) this.db.exec("ROLLBACK"); throw error;}
    finally {unlock();}
  }
}
