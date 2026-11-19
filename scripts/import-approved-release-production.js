"use strict";
// Production import of the approved-library releases. The local variant is tied to the
// synthetic demo stand; this one connects with explicit production credentials, refuses
// a demo database name and requires an explicit confirmation equal to the database name,
// exactly like the migration runner. It is idempotent: an already stored version or
// release is skipped by importApprovedV1Local.
const fs = require("node:fs");
const {Pool} = require("pg");
const {importApprovedV1Local} = require("./import-approved-v1-local.js");

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
    const ids = await importApprovedV1Local(client);
    await client.query("COMMIT");
    console.log("APPROVED_RELEASES_IMPORTED=" + ids.length);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
})().catch(error => {
  console.error("Approved release import failed: " + (error && error.message ? error.message : "unknown") + "; no changes were committed.");
  process.exitCode = 1;
});
