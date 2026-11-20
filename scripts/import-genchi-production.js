"use strict";
// Production import of the pinned Genchi measurement release. Same guard rails as the
// approved-library import: explicit credentials, TLS required, demo names refused and a
// confirmation equal to the database name. The import is idempotent.
const fs = require("node:fs");
const {Pool} = require("pg");
const {importGenchiLocal} = require("./import-genchi-local.js");
function required(name) {
  const value = process.env[name];
  if (typeof value !== "string" || !value.length) throw new Error("ENV_REQUIRED");
  return value;
}
function integer(name, fallback) {
  const n = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(n) || n < 1 || n > 65535) throw new Error("ENV_INVALID");
  return n;
}
(async () => {
  const database = required("PGDATABASE");
  if (process.env.PEDPSY_IMPORT_CONFIRM !== database) throw new Error("IMPORT_CONFIRM_REQUIRED");
  if (!/^[a-z0-9_]{1,63}$/.test(database) || database.startsWith("pedpsy_demo_")) throw new Error("DATABASE_INVALID");
  const sslMode = required("PGSSL");
  if (sslMode !== "require" && sslMode !== "verify-full") throw new Error("SSL_REQUIRED");
  const pool = new Pool({host: required("PGHOST"), port: integer("PGPORT", "5432"), database,
    user: required("PGUSER"), password: required("PGPASSWORD"),
    ssl: {rejectUnauthorized: sslMode === "verify-full",
      ...(process.env.PEDPSY_PG_CA_CERT ? {ca: fs.readFileSync(process.env.PEDPSY_PG_CA_CERT, "utf8")} : {})},
    max: 1, connectionTimeoutMillis: 10000, idleTimeoutMillis: 5000});
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const id = await importGenchiLocal(client);
    await client.query("COMMIT");
    console.log("GENCHI_RELEASE_IMPORTED=" + id);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
})().catch(error => {
  console.error("Genchi release import failed: " + (error && error.message ? error.message : "unknown") + "; no changes were committed.");
  process.exitCode = 1;
});
