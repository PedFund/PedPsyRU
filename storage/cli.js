"use strict";

const {mkdirSync} = require("node:fs");
const path = require("node:path");
const {openDatabase, migrate} = require("./database.js");
const {importTkiRelease} = require("./releases.js");
const {seedTraining} = require("./seed.js");

const command = process.argv[2];
if (!["migrate","seed","check"].includes(command) || process.argv.length !== 3) {
  console.error("Usage: node storage/cli.js migrate|seed|check (local synthetic database only)");
  process.exitCode = 1;
} else {
  const directory = path.join(__dirname, "..", ".local");
  const filename = path.join(directory, "training.sqlite");
  let db;
  try {
    if (command !== "check") mkdirSync(directory, {recursive: true});
    db = openDatabase(filename, {readOnly: command === "check"});
    if (command !== "check") {
      console.log("Applied migrations:", migrate(db));
      if (command === "seed") seedTraining(db, importTkiRelease(db));
    }
    const integrity = db.prepare("PRAGMA integrity_check").all();
    const foreignKeys = db.prepare("PRAGMA foreign_key_check").all();
    if (integrity.length !== 1 || integrity[0].integrity_check !== "ok" || foreignKeys.length) throw new Error("DATABASE_CHECK_FAILED");
    const tables = ["schema_migrations","studies","research_groups","research_stages","participants","instrument_releases",
      "release_items","assignments","stage_enrollments","attempts","responses","attempt_results",
      "participant_credentials","participant_sessions","staff_credentials","staff_sessions","access_audit_events"];
    const counts = Object.fromEntries(tables.map(table => [table, db.prepare(`SELECT count(*) AS count FROM ${table}`).get().count]));
    console.log(JSON.stringify({database: filename, dataset_kind: "demo", counts, integrity: "ok", foreign_keys: "ok",
      answer_writes_connected: false, participant_access_schema: true, staff_access_schema: true}, null, 2));
  } catch (error) {
    console.error("Training database operation failed:", error.message);
    process.exitCode = 1;
  } finally {if (db) db.close();}
}
