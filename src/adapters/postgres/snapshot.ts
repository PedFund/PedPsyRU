import {createHash} from "node:crypto";
import type {PoolClient} from "pg";
import type {DatabaseSync} from "node:sqlite";
import {canonicalJson, releasePackage, responsesDigest} from "../../../storage/releases.js";
import {scoreTki, type TkiResponse} from "../../../core/tki-contract.js";

export const DOMAIN_TABLES = ["users", "studies", "study_memberships", "research_groups", "research_stages", "instrument_releases", "release_items", "assignments", "participants", "stage_enrollments", "attempts", "responses", "attempt_results", "seed_runs"] as const;
type Table = typeof DOMAIN_TABLES[number];
type Row = Record<string, unknown>;
export interface DemoSnapshot {format: "pedpsy-demo-snapshot-1"; tables: Record<Table, Row[]>; digest: string}
const jsonFields = new Set(["form_snapshot", "options", "payload", "manifest"]);
function normalized(rows: Row[]): Row[] {
  return rows.map(row => Object.fromEntries(Object.entries(row).map(([key, value]) => {
    if (value instanceof Date) return [key, value.toISOString()];
    if (jsonFields.has(key) && typeof value === "string") return [key, JSON.parse(value) as unknown];
    if (["revision", "input_revision"].includes(key)) {
      const n = Number(value); if (!Number.isSafeInteger(n) || n < 0) throw new Error("UNSAFE_REVISION"); return [key, n];
    }
    return [key, value];
  }))).sort((a, b) => canonicalJson(a).localeCompare(canonicalJson(b), "en"));
}
const digest = (tables: DemoSnapshot["tables"]): string => "sha256:" + createHash("sha256").update(canonicalJson(tables)).digest("hex");
function verified(tables: DemoSnapshot["tables"]): DemoSnapshot {
  const pkg = releasePackage();
  if (!tables.studies.length || tables.studies.some(s => s.dataset_kind !== "demo")) throw new Error("DEMO_ONLY_SNAPSHOT");
  // Synthetic provenance is necessary, but is not a substitute for a human's
  // explicit permission when a future source contains actual personal data.
  if (!tables.seed_runs.length || tables.seed_runs.some(r => !(r.manifest as Row)?.synthetic)) throw new Error("SYNTHETIC_PROVENANCE_REQUIRED");
  for (const release of tables.instrument_releases) {
    if (canonicalJson(release.form_snapshot) !== pkg.formSnapshot || release.form_digest !== pkg.formDigest || release.key_digest !== pkg.keyDigest ||
      release.method_version_id !== "tki_ru_30_pairs@1.0.0" || release.handler_version !== "tki-contract-0.3.0" || release.contract_version !== "1.0") throw new Error("SNAPSHOT_RELEASE_MISMATCH");
    const items = tables.release_items.filter(i => i.release_id === release.id).sort((a,b) => Number(a.ordinal) - Number(b.ordinal));
    if (items.length !== 30 || items.some((i,n) => i.item_id !== pkg.form.items[n]?.id || canonicalJson(i.options) !== canonicalJson(pkg.form.items[n]?.options))) throw new Error("SNAPSHOT_ITEMS_MISMATCH");
  }
  for (const attempt of tables.attempts) {
    const results = tables.attempt_results.filter(r => r.attempt_id === attempt.id);
    if (attempt.status === "draft" && results.length || attempt.status === "completed" && results.length !== 1) throw new Error("SNAPSHOT_COMPLETION_MISMATCH");
    if (attempt.status !== "completed") continue;
    const result = results[0]!;
    const values = tables.responses.filter(r => r.attempt_id === attempt.id).map(r => ({item_id: r.item_id, value: r.value}) as TkiResponse);
    const items = pkg.form.items.map(i => ({item_id: i.id}));
    const scored = scoreTki({contract_version: "1.0", method_version_id: "tki_ru_30_pairs@1.0.0", handler_version: "tki-contract-0.3.0", responses: values});
    if (scored.status !== "scored" || values.length !== 30 || result.responses_digest !== responsesDigest(items, values) ||
      result.id !== attempt.completion_result_id || Number(attempt.revision) !== Number(result.input_revision) + 1 ||
      canonicalJson(result.payload) !== canonicalJson(scored)) throw new Error("SNAPSHOT_RESULT_MISMATCH");
  }
  return {format: "pedpsy-demo-snapshot-1", tables, digest: digest(tables)};
}
// Read transaction only. No migrations, seed, auth/session export or source writes.
export function exportDemoSnapshot(source: DatabaseSync): DemoSnapshot {
  if (source.isTransaction) throw new Error("NESTED_TRANSACTION");
  source.exec("BEGIN");
  try {
    if (source.prepare("PRAGMA integrity_check").get()?.integrity_check !== "ok" || source.prepare("PRAGMA foreign_key_check").all().length) throw new Error("SOURCE_INTEGRITY_FAILED");
    const tables = Object.fromEntries(DOMAIN_TABLES.map(table => [table, normalized(source.prepare("SELECT * FROM " + table).all())])) as DemoSnapshot["tables"];
    const result = verified(tables); source.exec("COMMIT"); return result;
  } catch (error) {source.exec("ROLLBACK"); throw error;}
}
export async function inspectPostgresSnapshot(client: PoolClient): Promise<DemoSnapshot> {
  const tables = {} as DemoSnapshot["tables"];
  for (const table of DOMAIN_TABLES) tables[table] = normalized((await client.query<Row>("SELECT * FROM pedpsy." + table)).rows);
  return verified(tables);
}
export async function importDemoSnapshot(client: PoolClient, snapshot: DemoSnapshot): Promise<void> {
  if (snapshot.format !== "pedpsy-demo-snapshot-1" || verified(snapshot.tables).digest !== snapshot.digest) throw new Error("SNAPSHOT_DIGEST_MISMATCH");
  await client.query("BEGIN");
  try {
    await client.query("SELECT pg_advisory_xact_lock(5151980002)");
    const role = await client.query("SELECT current_user=(SELECT nspowner::regrole::text FROM pg_namespace WHERE nspname='pedpsy') AS owner");
    if (!role.rows[0]?.owner) throw new Error("MIGRATOR_REQUIRED");
    // Refuse to overwrite, merge or silently repair any existing target.
    for (const table of [...DOMAIN_TABLES, "participant_credentials", "participant_sessions", "staff_credentials", "staff_sessions", "researcher_credentials", "researcher_sessions", "access_audit_events", "login_throttles"])
      if ((await client.query("SELECT 1 FROM pedpsy." + table + " LIMIT 1")).rowCount) throw new Error("EMPTY_TARGET_REQUIRED");
    for (const table of DOMAIN_TABLES) {
      const rows = table === "research_stages" ? [...snapshot.tables[table]].sort((a,b) => Number(a.ordinal)-Number(b.ordinal)) : snapshot.tables[table];
      for (const original of rows) {
        const row = table === "attempts" && original.status === "completed" ? {...original, status: "draft", revision: Number(original.revision)-1, completion_result_id: null, completed_at: null} : original;
        const columns = Object.keys(row);
        if (columns.some(c => !/^[a-z_]+$/.test(c))) throw new Error("INVALID_SNAPSHOT_COLUMN");
        const values = columns.map(c => jsonFields.has(c) ? JSON.stringify(row[c]) : row[c]);
        await client.query(`INSERT INTO pedpsy.${table}(${columns.map(c => '"'+c+'"').join(",")}) VALUES(${columns.map((_,i) => "$"+(i+1)).join(",")})`, values);
      }
    }
    for (const row of snapshot.tables.attempts.filter(a => a.status === "completed"))
      await client.query("UPDATE pedpsy.attempts SET status='completed',revision=$1,completion_result_id=$2,completed_at=$3,updated_at=$4 WHERE id=$5", [row.revision,row.completion_result_id,row.completed_at,row.updated_at,row.id]);
    if ((await inspectPostgresSnapshot(client)).digest !== snapshot.digest) throw new Error("IMPORTED_SNAPSHOT_MISMATCH");
    await client.query("COMMIT");
  } catch (error) {await client.query("ROLLBACK"); throw error;}
}
