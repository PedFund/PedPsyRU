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
  await client.query(`GRANT SELECT ON pedpsy.attempts,pedpsy.responses,pedpsy.attempt_results,pedpsy.release_presentation_corrections,pedpsy.instrument_releases,pedpsy.release_items TO "${role}"`);
  await client.query(`GRANT UPDATE(revision,current_item_id,status,completion_result_id,completed_at,updated_at) ON pedpsy.attempts TO "${role}"`);
  await client.query(`GRANT INSERT,DELETE ON pedpsy.responses TO "${role}"`);
  await client.query(`GRANT INSERT ON pedpsy.attempt_results,pedpsy.access_audit_events TO "${role}"`);
  await client.query(`GRANT EXECUTE ON FUNCTION pedpsy.session_actor(),pedpsy.owns_active_attempt(uuid),pedpsy.can_read_attempt(uuid),pedpsy.can_read_release(uuid),pedpsy.touch_session() TO "${role}"`);
  await client.query(`GRANT EXECUTE ON FUNCTION pedpsy.lock_participant_scope(uuid) TO "${role}"`);
  await client.query(`GRANT EXECUTE ON FUNCTION pedpsy.participant_login_material(text),pedpsy.finish_participant_login(uuid,integer,text,text),pedpsy.lock_participant_identity(),pedpsy.logout_participant(),pedpsy.record_participant_denial(text) TO "${role}"`);
  await client.query(`GRANT EXECUTE ON FUNCTION pedpsy.account_actor(),pedpsy.account_owns_study(uuid),pedpsy.record_account_check(text,boolean,text) TO "${role}"`);
  await client.query(`GRANT EXECUTE ON FUNCTION pedpsy.staff_login_material(text),pedpsy.finish_staff_password(uuid,integer,text,text),pedpsy.lock_staff_challenge(text) TO "${role}"`);
  await client.query(`GRANT EXECUTE ON FUNCTION pedpsy.staff_mfa_material(text),pedpsy.begin_staff_enrollment(text,text),pedpsy.staff_challenge_identity(text),pedpsy.finish_staff_mfa(text,bigint,text,text,text[]),pedpsy.lock_staff_identity(),pedpsy.touch_staff_identity(),pedpsy.logout_staff() TO "${role}"`);
  await client.query(`GRANT EXECUTE ON FUNCTION pedpsy.lock_staff_operation(text),pedpsy.list_researchers(),pedpsy.invite_researcher(uuid,uuid,text,text,text,text),pedpsy.accept_researcher_invite(text,text,text),pedpsy.reserve_invite_attempt(text),pedpsy.block_researcher(uuid),pedpsy.researcher_login_material(text),pedpsy.finish_researcher_login(uuid,integer,text,text),pedpsy.lock_researcher_identity(),pedpsy.researcher_home(),pedpsy.logout_researcher() TO "${role}"`);
  await client.query(`GRANT EXECUTE ON FUNCTION pedpsy.assign_staff_role(uuid,text,uuid),pedpsy.list_staff_accounts() TO "${role}"`);
  await client.query(`GRANT EXECUTE ON FUNCTION pedpsy.staff_protocol_summary(),pedpsy.staff_diagnostic_snapshot(uuid,boolean) TO "${role}"`);
  await client.query(`GRANT EXECUTE ON FUNCTION pedpsy.create_study(uuid,text),pedpsy.read_study_design(uuid) TO "${role}"`);
  await client.query(`GRANT EXECUTE ON FUNCTION pedpsy.create_study_for_researcher(uuid,uuid,text) TO "${role}"`);
  await client.query(`GRANT EXECUTE ON FUNCTION pedpsy.configure_study_group(uuid,integer,uuid,text,text,boolean) TO "${role}"`);
  await client.query(`GRANT EXECUTE ON FUNCTION pedpsy.configure_study_stage(uuid,integer,uuid,text,integer,boolean) TO "${role}"`);
  await client.query(`GRANT EXECUTE ON FUNCTION pedpsy.configure_study_assignments(uuid,integer,uuid,uuid,uuid[]) TO "${role}"`);
  await client.query(`GRANT EXECUTE ON FUNCTION pedpsy.copy_study_stage(uuid,integer,uuid,uuid,text,integer) TO "${role}"`);
  await client.query(`GRANT EXECUTE ON FUNCTION pedpsy.change_study_lifecycle(uuid,integer,text),pedpsy.rename_study(uuid,integer,text) TO "${role}"`);
  await client.query(`GRANT EXECUTE ON FUNCTION pedpsy.staff_study_design_list() TO "${role}"`);
  await client.query(`GRANT EXECUTE ON FUNCTION pedpsy.group_invitation_policy_scope(uuid,uuid),pedpsy.list_group_invitations(uuid,uuid),pedpsy.create_group_invitation(uuid,uuid,uuid,text,bigint),pedpsy.revoke_group_invitation(uuid,uuid,uuid,integer) TO "${role}"`);
  await client.query(`GRANT EXECUTE ON FUNCTION pedpsy.list_group_stage_access(uuid,uuid),pedpsy.open_group_stage(uuid,uuid,uuid,integer) TO "${role}"`);
  await client.query(`GRANT EXECUTE ON FUNCTION pedpsy.registration_landing(text),pedpsy.reserve_registration_start(text,text,text,text),pedpsy.queue_registration_confirmation(uuid,text,text,text,text,uuid,text) TO "${role}"`);
  await client.query(`GRANT EXECUTE ON FUNCTION pedpsy.confirm_registration_email(text,text,text),pedpsy.participant_email_login_material(uuid,text),pedpsy.finish_participant_email_login(uuid,integer,text,uuid,text) TO "${role}"`);
  await client.query(`GRANT EXECUTE ON FUNCTION pedpsy.registration_context(text),pedpsy.registration_receipt_material(text,text),pedpsy.finish_registration_receipt(text,text,uuid,text) TO "${role}"`);
  await client.query(`GRANT EXECUTE ON FUNCTION pedpsy.record_registration_http_denial(text) TO "${role}"`);
  await client.query(`GRANT EXECUTE ON FUNCTION pedpsy.read_passport_schema(uuid),pedpsy.configure_passport_schema(uuid,integer,integer,jsonb,jsonb) TO "${role}"`);
  await client.query(`GRANT EXECUTE ON FUNCTION pedpsy.read_own_passport(),pedpsy.save_own_passport(integer,integer,jsonb),pedpsy.complete_own_passport(integer,integer) TO "${role}"`);
  await client.query(`GRANT EXECUTE ON FUNCTION pedpsy.read_own_consents(),pedpsy.accept_own_consent(text,text,integer,boolean) TO "${role}"`);
  await client.query(`REVOKE ALL ON FUNCTION pedpsy.save_own_passport_legacy(integer,integer,jsonb),pedpsy.complete_own_passport_legacy(integer,integer),pedpsy.change_research_workbench_v1(uuid,integer,text,jsonb),pedpsy.research_progress_v1(uuid) FROM "${role}"`);
  await client.query(`GRANT EXECUTE ON FUNCTION pedpsy.save_method_library_draft(integer,text,text,jsonb,jsonb),pedpsy.list_method_library(),pedpsy.read_method_library(text,text),pedpsy.read_available_methods(),pedpsy.read_method_planning_catalogue(),pedpsy.method_transfer_status() TO "${role}"`);
  await client.query(`GRANT EXECUTE ON FUNCTION pedpsy.read_research_workbench(uuid),pedpsy.change_research_workbench(uuid,integer,text,jsonb),pedpsy.close_research_stage(uuid,integer,uuid),pedpsy.change_research_profile_schema(uuid,integer,jsonb),pedpsy.research_progress(uuid),pedpsy.research_method_progress(uuid),pedpsy.research_method_analytics(uuid,uuid,uuid),pedpsy.research_participant_passport_stats(uuid),pedpsy.own_profile(text,integer,integer,jsonb) TO "${role}"`);
  await client.query(`GRANT EXECUTE ON FUNCTION pedpsy.read_own_stages() TO "${role}"`);
  await client.query(`GRANT EXECUTE ON FUNCTION pedpsy.enroll_own_stage(uuid,integer,integer,integer) TO "${role}"`);
}
