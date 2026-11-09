import {readFileSync} from "node:fs";
export interface ProductionDatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  max: number;
  connectionTimeoutMillis: number;
  idleTimeoutMillis: number;
  ssl: {rejectUnauthorized: boolean; ca?: string};
}
export interface ProductionConfig {
  db: ProductionDatabaseConfig;
  host: string;
  port: number;
  origin: string;
  mfaKey: string;
  contactKey?: string;
}
function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (typeof value !== "string" || !value.length) throw new Error("PRODUCTION_CONFIG_REQUIRED");
  return value;
}
function integer(env: NodeJS.ProcessEnv, name: string, fallback: number | undefined, min: number, max: number): number {
  const raw = env[name] ?? (fallback === undefined ? undefined : String(fallback));
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) throw new Error("PRODUCTION_CONFIG_INVALID");
  return value;
}
function key32(env: NodeJS.ProcessEnv, name: string): string {
  const value = required(env, name);
  const bytes = Buffer.from(value, "base64");
  if (bytes.length !== 32 || bytes.toString("base64") !== value) throw new Error("PRODUCTION_KEY_INVALID");
  return value;
}
export function productionConfig(env: NodeJS.ProcessEnv): ProductionConfig {
  if (env.PEDPSY_ENV !== "production") throw new Error("PRODUCTION_ENV_REQUIRED");
  const origin = required(env, "PEDPSY_PUBLIC_ORIGIN");
  let url: URL;
  try { url = new URL(origin); } catch { throw new Error("PRODUCTION_ORIGIN_INVALID"); }
  if (url.protocol !== "https:" || url.origin !== origin || url.pathname !== "/" || url.search || url.hash ||
    url.username || url.password || ["localhost", "127.0.0.1", "::1"].includes(url.hostname)) throw new Error("PRODUCTION_ORIGIN_INVALID");
  const database = required(env, "PGDATABASE");
  if (!/^[a-z0-9_]{1,63}$/.test(database) || database.startsWith("pedpsy_demo_")) throw new Error("PRODUCTION_DATABASE_INVALID");
  const user = required(env, "PGUSER");
  if (!/^pedpsy_runtime_[a-f0-9]{16}$/.test(user)) throw new Error("PRODUCTION_RUNTIME_ROLE_INVALID");
  const sslMode = required(env, "PGSSL");
  if (sslMode !== "require" && sslMode !== "verify-full") throw new Error("PRODUCTION_SSL_REQUIRED");
  const mfaKey = key32(env, "PEDPSY_MFA_KEY");
  const contactKey = env.PEDPSY_CONTACT_KEY ? key32(env, "PEDPSY_CONTACT_KEY") : undefined;
  if (contactKey && env.PEDPSY_CONTACT_DEMO !== "1") throw new Error("CONTACT_DEMO_MODE_REQUIRED");
  if (contactKey === mfaKey) throw new Error("PRODUCTION_KEYS_MUST_DIFFER");
  return {
    db: {host: required(env, "PGHOST"), port: integer(env, "PGPORT", 5432, 1, 65535), database, user,
      password: required(env, "PGPASSWORD"), max: integer(env, "PEDPSY_DB_POOL", 8, 1, 32),
      connectionTimeoutMillis: 5000, idleTimeoutMillis: 5000, ssl: {rejectUnauthorized: sslMode === "verify-full", ...(env.PEDPSY_PG_CA_CERT ? {ca: readFileSync(env.PEDPSY_PG_CA_CERT, "utf8")} : {})}},
    host: env.HOST ?? "127.0.0.1", port: integer(env, "PORT", 4174, 1024, 65535), origin, mfaKey,
    ...(contactKey ? {contactKey} : {})
  };
}
