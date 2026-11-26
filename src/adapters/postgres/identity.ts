import {pinnedParticipantForm} from "../pinned-instrument-releases.js";
import {createHash, randomBytes} from "node:crypto";
import type {Pool, PoolClient} from "pg";
import {derive, SCRYPT, validLogin, validPassword, validToken, csrfFor, equalText} from "../../../storage/access.js";
import {ParticipationError} from "../../ports/errors.js";
import type {ParticipantGateway, ParticipantForm, PublicAttempt} from "../../ports/identity.js";
import type {ParticipantContext} from "../../ports/participation.js";
import {DEFAULT_PARTICIPANT_ADMISSION, type ParticipantAdmissionPolicy} from "../../ports/login-policy.js";
import {DerivationGate} from "../derivation-gate.js";
import {PostgresUnitOfWork, assertRuntimeClient, mapPostgresError} from "./unit-of-work.js";
import {LoginLock} from "./login-lock.js";
const hash = (token: string): string => "sha256:" + createHash("sha256").update(token).digest("hex");
interface Material {throttled: boolean; credential_id: string; credential_version: number; salt: string; password_hash: string}
export class PostgresParticipantGateway implements ParticipantGateway {
  private readonly gate: DerivationGate;
  private readonly lock: LoginLock;
  private readonly dummySalt = randomBytes(16);
  private readonly dummyHash = randomBytes(64).toString("hex");
  constructor(private readonly pool: Pool, private readonly uow: PostgresUnitOfWork, private readonly derivePassword = derive,
    private readonly admission: ParticipantAdmissionPolicy = DEFAULT_PARTICIPANT_ADMISSION) {
    this.gate = new DerivationGate(admission.derivationConcurrency, admission.queueLimit, admission.queueTimeoutMs);
    this.lock = new LoginLock(pool);
  }
  private async query<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await assertRuntimeClient(client); await client.query("BEGIN");
      try {
        await client.query("SELECT set_config('statement_timeout','5000',true),set_config('lock_timeout','3000',true),set_config('idle_in_transaction_session_timeout','10000',true)");
        const result=await callback(client); await client.query("COMMIT");return result;
      } catch (error) {await client.query("ROLLBACK");throw error;}
    } catch (error) {throw mapPostgresError(error);} finally {client.release();}
  }
  async login(input: unknown) {
    if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).sort().join(",") !== "login_id,password") throw new ParticipationError(400,"INVALID_LOGIN");
    const data = input as Record<string,unknown>;
    if (!validLogin(data.login_id) || !validPassword(data.password)) throw new ParticipationError(400,"INVALID_LOGIN");
    const loginId = data.login_id as string,password = data.password as string;
    const scope = "participant-code", identity = loginId;
    if (await this.lock.blocked(scope, identity)) throw new ParticipationError(429, "LOGIN_LOCKED");
    try {
      const session = await this.gate.run(async () => {
        const material = await this.query(async client => (await client.query<Material>("SELECT * FROM pedpsy.participant_login_material_v2($1,$2,$3)", [loginId,this.admission.globalLimit,this.admission.globalWindowMs])).rows[0]);
        if (material?.throttled) throw new ParticipationError(429,"LOGIN_THROTTLED");
        const derived = await this.derivePassword(password, material ? Buffer.from(material.salt,"hex") : this.dummySalt,64,SCRYPT);
        const matches = equalText(derived.toString("hex"), material?.password_hash ?? this.dummyHash); derived.fill(0);
        const token = randomBytes(32).toString("base64url");
        const expiry = await this.query(async client => (await client.query<{expiry: string | null}>("SELECT pedpsy.finish_participant_login($1,$2,$3,$4) expiry", [matches ? material?.credential_id : null,matches ? material?.credential_version : null,matches ? material?.password_hash : null,hash(token)])).rows[0]?.expiry);
        if (!expiry) throw new ParticipationError(401,"INVALID_LOGIN");
        return {token, csrf: csrfFor(token), expiresAt: Number(expiry)};
      });
      await this.lock.success(scope, identity);
      return session;
    } catch (error) {
      if (error instanceof ParticipationError && ["INVALID_LOGIN","LOGIN_THROTTLED"].includes(error.code)) await this.lock.failure(scope, identity);
      throw error;
    }
  }
  private async withSession<T>(token: string, callback: (client: PoolClient) => Promise<T>): Promise<T> {
    if (!validToken(token)) throw new ParticipationError(401,"AUTH_REQUIRED");
    return this.query(async client => {
      await client.query("SELECT set_config('app.session_hash',$1,true)",[hash(token)]);
      await client.query("SELECT pedpsy.lock_participant_identity()");
      return callback(client);
    });
  }
  async auth(token: string): Promise<{context: ParticipantContext; csrf: string}> {
    const context = await this.uow.context(token);
    return {context, csrf: csrfFor(token)};
  }
  async session(token: string): Promise<{context: ParticipantContext; csrf: string; attempts: PublicAttempt[]}> {
    const context = await this.uow.context(token);
    const attempts = await this.withSession(token, async client => {
      // Scope the scan to the current participant before RLS evaluates the
      // per-row ownership policy (121). Without the predicate this read was
      // O(all attempts in the database); the policy itself is unchanged.
      const rows = await client.query<{id: string; status: "draft" | "completed"; revision: string; current_item_id: string}>(
        "SELECT id,status,revision,current_item_id FROM pedpsy.attempts WHERE study_id=$1 AND enrollment_id=ANY(pedpsy.own_enrollment_ids()) ORDER BY id", [context.studyId]);
      await client.query("INSERT INTO pedpsy.access_audit_events(id,at_ms,credential_id,study_id,action,outcome,reason,record_count) SELECT gen_random_uuid(),floor(extract(epoch FROM clock_timestamp())*1000)::bigint,credential_id,study_id,'session_read','allow','OWN_SCOPE',$1 FROM pedpsy.session_actor()",[rows.rowCount]);
      await client.query("SELECT pedpsy.touch_session()");
      return rows.rows.map(r => ({id:r.id,status:r.status,revision:Number(r.revision),current_item_id:r.current_item_id}));
    });
    return {context,csrf:csrfFor(token),attempts};
  }
  assertCsrf(token: string, csrf: string): void {
    if (!validToken(token) || !equalText(csrf,csrfFor(token))) throw new ParticipationError(403,"CSRF_REJECTED");
  }
  async logout(token: string, csrf: string): Promise<void> {
    await this.uow.context(token); this.assertCsrf(token,csrf);
    await this.withSession(token,async client => {await client.query("SELECT pedpsy.logout_participant()");});
  }
  async form(token: string, id: string): Promise<ParticipantForm> {
    const context = await this.uow.context(token);
    return this.uow.run(context,async ports => {
      const state = await ports.attempts.getAuthorized(id,true); if (!state) throw new ParticipationError(404,"NOT_AVAILABLE");
      const pinned=await ports.releases.getPinned(state.releaseId);
      await ports.audit.appendRequired({event:"draft_read",resourceId:id});
      return pinnedParticipantForm(pinned);
    });
  }
  async denied(token: string, reason: string): Promise<void> {
    await this.query(async client => {
      await client.query("SELECT set_config('app.session_hash',$1,true)",[validToken(token)?hash(token):""]);
      await client.query("SELECT pedpsy.record_participant_denial($1)",[reason]);
    });
  }
}
