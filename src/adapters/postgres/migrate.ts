import {readFileSync, readdirSync} from "node:fs";
import path from "node:path";
import {createHash} from "node:crypto";
import type {PoolClient} from "pg";

export async function migratePostgres(client: PoolClient, directory: string): Promise<number> {
  const names = readdirSync(directory).filter(name => /^\d{3}_[a-z0-9_]+\.sql$/.test(name)).sort();
  const migrations = names.map((name, index) => {
    if (Number(name.slice(0, 3)) !== index + 1) throw new Error("MIGRATION_SEQUENCE_INVALID");
    const sql = readFileSync(path.join(directory, name), "utf8");
    return {name, sql, version: index + 1, digest: createHash("sha256").update(sql).digest("hex")};
  });
  if (!migrations.length) throw new Error("NO_MIGRATIONS");
  await client.query("BEGIN");
  try {
    await client.query("SELECT pg_advisory_xact_lock(5151980001)");
    await client.query("CREATE TABLE IF NOT EXISTS public.pedpsy_schema_migrations(version integer PRIMARY KEY,name text UNIQUE NOT NULL,digest text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())");
    const applied = await client.query<{version: number; name: string; digest: string}>("SELECT version,name,digest FROM public.pedpsy_schema_migrations ORDER BY version");
    for (let i = 0; i < applied.rows.length; i++) {
      const row = applied.rows[i]!, expected = migrations[i];
      if (!expected || row.version !== expected.version || row.name !== expected.name || row.digest !== expected.digest) throw new Error("MIGRATION_HISTORY_MISMATCH");
    }
    for (const migration of migrations.slice(applied.rows.length)) {
      await client.query(migration.sql);
      await client.query("INSERT INTO public.pedpsy_schema_migrations(version,name,digest) VALUES($1,$2,$3)", [migration.version, migration.name, migration.digest]);
    }
    await client.query("REVOKE ALL ON public.pedpsy_schema_migrations FROM PUBLIC");
    await client.query("COMMIT"); return migrations.length - applied.rows.length;
  } catch (error) {await client.query("ROLLBACK"); throw error;}
}
export async function grantRuntime(client: PoolClient, role: string): Promise<void> {
  if (!/^pedpsy_runtime_[a-f0-9]{16}$/.test(role)) throw new Error("INVALID_RUNTIME_ROLE");
  const rows = await client.query<{rolsuper: boolean; rolbypassrls: boolean; rolcreaterole: boolean; rolcreatedb: boolean}>(
    "SELECT rolsuper,rolbypassrls,rolcreaterole,rolcreatedb FROM pg_roles WHERE rolname=$1", [role]);
  const row = rows.rows[0];
  if (!row || row.rolsuper || row.rolbypassrls || row.rolcreaterole || row.rolcreatedb) throw new Error("UNSAFE_RUNTIME_ROLE");
  const membership = await client.query("SELECT 1 FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname=$1)", [role]);
  const owner = await client.query("SELECT 1 FROM pg_class WHERE relowner=(SELECT oid FROM pg_roles WHERE rolname=$1) UNION ALL SELECT 1 FROM pg_database WHERE datname=current_database() AND datdba=(SELECT oid FROM pg_roles WHERE rolname=$1)", [role]);
  if (membership.rowCount || owner.rowCount) throw new Error("UNSAFE_RUNTIME_ROLE");
  // Validated role identifier, never HTTP input; no GRANT ALL/table ownership.
  await client.query(`GRANT USAGE ON SCHEMA pedpsy TO "${role}"`);
  await client.query(`GRANT SELECT ON pedpsy.attempts,pedpsy.responses,pedpsy.attempt_results,pedpsy.instrument_releases,pedpsy.release_items TO "${role}"`);
  await client.query(`GRANT UPDATE(revision,current_item_id,status,completion_result_id,completed_at,updated_at) ON pedpsy.attempts TO "${role}"`);
  await client.query(`GRANT INSERT,DELETE ON pedpsy.responses TO "${role}"`);
  await client.query(`GRANT INSERT ON pedpsy.attempt_results,pedpsy.access_audit_events TO "${role}"`);
  await client.query(`GRANT EXECUTE ON FUNCTION pedpsy.session_actor(),pedpsy.owns_active_attempt(uuid),pedpsy.can_read_attempt(uuid),pedpsy.can_read_release(uuid),pedpsy.touch_session() TO "${role}"`);
}
