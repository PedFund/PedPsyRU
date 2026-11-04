import {verifyPinnedChoiceRelease} from "../pinned-instrument-releases.js";
import type {InstrumentResponse,InstrumentResult} from "../../ports/instruments.js";
import {AsyncLocalStorage} from "node:async_hooks";
import {createHash, randomUUID} from "node:crypto";
import type {Pool, PoolClient} from "pg";
import {ParticipationError} from "../../ports/errors.js";
import {validateDraft} from "../../ports/validation.js";
import type {UnitOfWork, ParticipantContext, TransactionPorts, AttemptSnapshot, PinnedRelease, StoredResult} from "../../ports/participation.js";
interface Actor {credential_id: string; study_id: string; participant_id: string; actor_role: string; credential_version: number}
interface AttemptRow {id: string; study_id: string; release_id: string; status: "draft" | "completed"; revision: string; current_item_id: string}
interface ResultRow {id: string; attempt_id: string; input_revision: string; responses_digest: string; calculated_at: Date; payload: InstrumentResult}
const uuid = (value: string): boolean => /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
export const mapPostgresError = (error: unknown): unknown => {
  const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
  if (code === "28000") return new ParticipationError(401, "AUTH_REQUIRED");
  if (code === "P0002") return new ParticipationError(404, "NOT_AVAILABLE");
  if (code === "P0001" && error && typeof error === "object" && "message" in error && error.message === "PARTICIPATION_REQUIREMENTS_CHANGED") return new ParticipationError(409,"PARTICIPATION_REQUIREMENTS_CHANGED");
  if (["55P03", "57014", "40001", "40P01"].includes(String(code))) return new ParticipationError(503, "STORAGE_BUSY");
  return error;
};
export async function assertRuntimeClient(client: PoolClient): Promise<void> {
  const result = await client.query<{unsafe: boolean}>(`SELECT rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole OR EXISTS(
    SELECT 1 FROM pg_class WHERE relowner=(SELECT oid FROM pg_roles WHERE rolname=current_user) AND relnamespace='pedpsy'::regnamespace)
    OR EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='pedpsy' AND nspowner=(SELECT oid FROM pg_roles WHERE rolname=current_user))
    OR EXISTS(SELECT 1 FROM pg_database WHERE datname=current_database() AND datdba=(SELECT oid FROM pg_roles WHERE rolname=current_user))
    OR EXISTS(SELECT 1 FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname=current_user)) AS unsafe FROM pg_roles WHERE rolname=current_user`);
  if (!result.rows[0] || result.rows[0].unsafe) throw new Error("UNSAFE_RUNTIME_ROLE");
}
export class PostgresUnitOfWork implements UnitOfWork {
  private readonly contexts = new WeakMap<ParticipantContext, string>();
  private readonly local = new AsyncLocalStorage<boolean>();
  constructor(private readonly pool: Pool) {}
  private async assertRuntime(client: PoolClient): Promise<void> {
    await assertRuntimeClient(client);
  }
  private async actor(client: PoolClient): Promise<Actor> {
    const result = await client.query<Actor>("SELECT * FROM pedpsy.session_actor()");
    if (result.rows.length !== 1 || result.rows[0]?.actor_role !== "participant") throw new ParticipationError(401, "AUTH_REQUIRED");
    return result.rows[0];
  }
  async context(token: string): Promise<ParticipantContext> {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new ParticipationError(401, "AUTH_REQUIRED");
    const hash = "sha256:" + createHash("sha256").update(token).digest("hex");
    const client = await this.pool.connect();
    try {
      await this.assertRuntime(client); await client.query("BEGIN");
      try {
        await client.query("SELECT set_config('app.session_hash',$1,true)", [hash]);
        const actor = await this.actor(client);
        const context: ParticipantContext = Object.freeze({realm: "participant", actorId: actor.credential_id, studyId: actor.study_id,
          participantId: actor.participant_id, sessionId: hash, sessionVersion: actor.credential_version});
        await client.query("COMMIT"); this.contexts.set(context, hash); return context;
      } catch (error) {await client.query("ROLLBACK"); throw error;}
    } finally {client.release();}
  }
  async run<T>(context: ParticipantContext, callback: (ports: TransactionPorts) => Promise<T>): Promise<T> {
    if (this.local.getStore()) throw new Error("NESTED_TRANSACTION");
    const hash = this.contexts.get(context); if (!hash) throw new ParticipationError(401, "AUTH_REQUIRED");
    const client = await this.pool.connect(); let open = false;
    try {
      await this.assertRuntime(client); await client.query("BEGIN"); open = true;
      await client.query("SELECT set_config('app.session_hash',$1,true),set_config('statement_timeout','5000',true),set_config('lock_timeout','3000',true),set_config('idle_in_transaction_session_timeout','10000',true)", [hash]);
      return await this.local.run(true, async () => {
        let live = true, attemptScope: string | null = null;
        const pendingAudit = new Set<string>();
        const ensure = async (): Promise<Actor> => {
          if (!live) throw new Error("TRANSACTION_CLOSED");
          const actor = await this.actor(client);
          if (actor.credential_id !== context.actorId || actor.study_id !== context.studyId || actor.participant_id !== context.participantId || actor.credential_version !== context.sessionVersion)
            throw new ParticipationError(401, "AUTH_REQUIRED");
          return actor;
        };
        const get = async (id: string): Promise<AttemptSnapshot> => {
          await ensure(); if (!uuid(id)) throw new ParticipationError(404, "NOT_AVAILABLE");
          if (attemptScope && attemptScope !== id) throw new Error("ONE_ATTEMPT_PER_TRANSACTION");
          if (!attemptScope) {await client.query("SELECT pedpsy.lock_participant_scope($1)", [id]); attemptScope = id;}
          await ensure();
          const result = await client.query<AttemptRow>("SELECT id,study_id,release_id,status,revision,current_item_id FROM pedpsy.attempts WHERE id=$1", [id]);
          const row = result.rows[0]; if (!row) throw new ParticipationError(404, "NOT_AVAILABLE");
          const values = await client.query<InstrumentResponse>("SELECT item_id,value FROM pedpsy.responses WHERE attempt_id=$1 ORDER BY item_id", [id]);
          return {id, studyId: row.study_id, participantId: context.participantId, releaseId: row.release_id, status: row.status,
            revision: Number(row.revision), currentItemId: row.current_item_id, responses: values.rows};
        };
        const pinned = async (id: string): Promise<PinnedRelease> => {
          await ensure(); if (!attemptScope || (await get(attemptScope)).releaseId !== id) throw new ParticipationError(404, "NOT_AVAILABLE");
          const release = await client.query("SELECT * FROM pedpsy.instrument_releases WHERE id=$1", [id]);
          const row = release.rows[0];
          const items=await client.query<{item_id:string;ordinal:number;options:unknown}>("SELECT item_id,ordinal,options FROM pedpsy.release_items WHERE release_id=$1 ORDER BY ordinal",[id]);
          const pinned=verifyPinnedChoiceRelease(row,items.rows);
          const correction=await client.query<{title:string|null;instruction:string|null}>("SELECT title,instruction FROM pedpsy.release_presentation_corrections WHERE release_id=$1 ORDER BY created_at_ms DESC, id DESC LIMIT 1",[id]);
          const c=correction.rows[0];
          return c?{...pinned,presentation:{...(c.title?{title:c.title}:{}),...(c.instruction?{instruction:c.instruction}:{})}}:pinned;
        };
        const stored = async (id: string): Promise<StoredResult | null> => {
          await get(id); const result = await client.query<ResultRow>("SELECT id,attempt_id,input_revision,responses_digest,calculated_at,payload FROM pedpsy.attempt_results WHERE attempt_id=$1", [id]);
          const row = result.rows[0]; return row ? {id: row.id, attemptId: row.attempt_id, inputRevision: Number(row.input_revision),
            responsesDigest: row.responses_digest, calculatedAt: row.calculated_at.toISOString(), payload: row.payload} : null;
        };
        const ports: TransactionPorts = {
          attempts: {
            getAuthorized: get,
            compareAndSave: async (id, input) => {
              const state = await get(id), release = await pinned(state.releaseId); validateDraft(input, release.itemIds,release.choiceValues);
              if (state.status !== "draft") throw new ParticipationError(409, "ATTEMPT_COMPLETED");
              if (state.revision !== input.expected_revision) throw new ParticipationError(409, "REVISION_CONFLICT");
              const updated = await client.query("UPDATE pedpsy.attempts SET revision=revision+1,current_item_id=$1,updated_at=clock_timestamp() WHERE id=$2 AND status='draft' AND revision=$3", [input.current_item_id, id, input.expected_revision]);
              if (updated.rowCount !== 1) throw new ParticipationError(409, "REVISION_CONFLICT");
              await client.query("DELETE FROM pedpsy.responses WHERE attempt_id=$1", [id]);
              for (const response of input.responses) await client.query("INSERT INTO pedpsy.responses(study_id,attempt_id,release_id,item_id,value) VALUES($1,$2,$3,$4,$5)", [context.studyId, id, state.releaseId, response.item_id, response.value]);
              pendingAudit.add(id + ":draft_saved"); return get(id);
            },
            markCompleted: async (id, revision, resultId, at) => {
              await get(id);
              const updated = await client.query("UPDATE pedpsy.attempts SET status='completed',revision=revision+1,completion_result_id=$1,completed_at=$2,updated_at=$2 WHERE id=$3 AND status='draft' AND revision=$4", [resultId, at, id, revision]);
              if (updated.rowCount !== 1) throw new ParticipationError(409, "REVISION_CONFLICT");
              pendingAudit.add(id + ":attempt_completed");
            }
          },
          releases: {getPinned: pinned},
          results: {
            getExisting: stored,
            insertOnce: async result => {
              const state = await get(result.attemptId), existing = await stored(result.attemptId); if (existing) return existing;
              await client.query("INSERT INTO pedpsy.attempt_results(id,study_id,attempt_id,release_id,input_revision,responses_digest,contract_version,handler_version,key_digest,calculated_at,payload) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
                [result.id, context.studyId, state.id, state.releaseId, result.inputRevision, result.responsesDigest, result.payload.contract_version, result.payload.handler_version, result.payload.calculation.key_digest, result.calculatedAt, JSON.stringify(result.payload)]);
              return result;
            }
          },
          audit: {appendRequired: async event => {
            const actor = await ensure(); await get(event.resourceId);
            await client.query("INSERT INTO pedpsy.access_audit_events(id,at_ms,credential_id,study_id,action,outcome,reason,resource_id) VALUES($1,$2,$3,$4,$5,'allow','OWN_SCOPE',$6)", [randomUUID(), Date.now(), actor.credential_id, actor.study_id, event.event, event.resourceId]);
            pendingAudit.delete(event.resourceId + ":" + event.event);
          }},
          outbox: {enqueueOnce: async () => {await ensure(); throw new Error("OUTBOX_NOT_IMPLEMENTED");}}
        };
        try {
          await ensure(); const result = await callback(ports); await ensure();
          if (pendingAudit.size) throw new Error("MANDATORY_AUDIT_MISSING");
          await client.query("SELECT pedpsy.touch_session()"); await client.query("COMMIT"); open = false; return result;
        } finally {live = false;}
      });
    } catch (error) {if (open) await client.query("ROLLBACK"); throw mapPostgresError(error);}
    finally {client.release();}
  }
}
