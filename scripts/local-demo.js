"use strict";
// Offline Windows development tooling. Never imported by HTTP or startup.
const fs = require("node:fs"), path = require("node:path");
const {randomBytes, randomUUID} = require("node:crypto");
const {spawn} = require("node:child_process");
const {Pool} = require("pg");
const root = path.resolve(__dirname, ".."), directory = path.join(root, ".local", "demo-stand");
function validateConfig(c, realm) {
  if (!["owner", "runtime"].includes(realm) || !c || c.host !== "127.0.0.1" || c.port !== 55432 ||
    !/^pedpsy_demo_[a-f0-9]{16}$/.test(c.database) ||
    c.user !== "pedpsy_" + realm + "_" + c.database.slice(-16) ||
    !/^[a-f0-9]{64}$/.test(c.password || "") ||
    realm === "runtime" && (!/^[A-Za-z0-9+/]{43}=$/.test(c.mfaKey || "") || Buffer.from(c.mfaKey, "base64").toString("base64") !== c.mfaKey)) throw new Error("INVALID_LOCAL_CONFIG");
  if (realm === "runtime" && c.contactDemo !== undefined && c.contactDemo !== true && c.contactDemo !== false) throw new Error("INVALID_LOCAL_CONTACT_CONFIG");
  if (realm === "runtime" && c.contactDemo === true) {
    const {contactDemoKey} = require("../dist/src/bootstrap/registration-config.js");
    const contact = contactDemoKey({PEDPSY_CONTACT_DEMO:"1",PEDPSY_CONTACT_KEY:c.contactKey,PEDPSY_MFA_KEY:c.mfaKey});
    if (!contact) throw new Error("INVALID_LOCAL_CONTACT_CONFIG");
    contact.fill(0);
  }
  return c;
}
function readConfig(realm) {return validateConfig(JSON.parse(fs.readFileSync(path.join(directory, realm + ".json"), "utf8")), realm);}
function privateWrite(name, value) {
  fs.writeFileSync(path.join(directory, name), value, {flag: "wx", mode: 0o600});
}
function initializeSecrets() {
  // PowerShell creates a fresh owner-only directory before this command.
  if (!fs.statSync(directory).isDirectory() || fs.readdirSync(directory).length) throw new Error("FRESH_PRIVATE_DIRECTORY_REQUIRED");
  const suffix = randomBytes(8).toString("hex"), common = {host: "127.0.0.1", port: 55432, database: "pedpsy_demo_" + suffix};
  for (const realm of ["owner", "runtime"]) privateWrite(realm + ".json", JSON.stringify({...common, user: "pedpsy_" + realm + "_" + suffix,
    password: randomBytes(32).toString("hex"), ...(realm === "runtime" ? {mfaKey: randomBytes(32).toString("base64")} : {})}));
  const password = randomBytes(32).toString("hex");
  privateWrite("control.json", JSON.stringify({host: common.host, port: common.port, database: "postgres", user: "postgres", password}));
  privateWrite("init-password.txt", password);
}
function configureCluster() {
  const cluster = path.join(directory, "cluster");
  if (fs.readFileSync(path.join(cluster, "PG_VERSION"), "utf8").trim() !== "18") throw new Error("PG18_REQUIRED");
  fs.appendFileSync(path.join(cluster, "postgresql.conf"), "\n# PedPsy private synthetic development cluster\nlisten_addresses = '127.0.0.1'\nport = 55432\nmax_connections = 40\nshared_buffers = '64MB'\npassword_encryption = 'scram-sha-256'\nlog_statement = 'none'\nlog_min_error_statement = 'panic'\nlog_parameter_max_length = 0\nlog_parameter_max_length_on_error = 0\n");
  fs.writeFileSync(path.join(cluster, "pg_hba.conf"), "# Loopback only; no trust or remote rules\nhost all all 127.0.0.1/32 scram-sha-256\n");
  fs.unlinkSync(path.join(directory, "init-password.txt")); // Only our one-use initialization file.
}
const pgConfig = c => ({host: c.host, port: c.port, database: c.database, user: c.user, password: c.password,
  max: 2, connectionTimeoutMillis: 5000, idleTimeoutMillis: 1000, ssl: false});
async function createDemoDatabase(control, owner, runtime) {
  validateConfig(owner, "owner"); validateConfig(runtime, "runtime");
  if (owner.database !== runtime.database) throw new Error("CONFIG_DATABASE_MISMATCH");
  // Generated, validated identifiers. Secrets stay in bound parameters and private memory.
  for (const c of [owner, runtime]) {
    const ddl = await control.query("SELECT format('CREATE ROLE %I LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS', $1::text, $2::text) AS ddl", [c.user, c.password]);
    await control.query(ddl.rows[0].ddl);
  }
  await control.query(`CREATE DATABASE "${owner.database}" OWNER "${owner.user}"`);
  await control.query(`REVOKE ALL ON DATABASE "${owner.database}" FROM PUBLIC`);
  await control.query(`GRANT CONNECT ON DATABASE "${owner.database}" TO "${owner.user}","${runtime.user}"`);
  const pool = new Pool(pgConfig(owner)), client = await pool.connect();
  try {
    await prepareOwnedDatabase(client, runtime.user);
  } finally {client.release(); await pool.end();}
}
async function prepareOwnedDatabase(client, runtimeRole) {
    const {migratePostgres, grantRuntime} = require("../dist/src/adapters/postgres/migrate.js");
    const {exportDemoSnapshot, importDemoSnapshot} = require("../dist/src/adapters/postgres/snapshot.js");
    const {openDatabase, migrate} = require("../storage/database.js");
    const {importTkiRelease} = require("../storage/releases.js");
    const {seedTraining} = require("../storage/seed.js");
    await migratePostgres(client, path.join(root, "storage", "postgres"));
    await grantRuntime(client, runtimeRole);
    const sqlite = openDatabase(); // Fresh :memory: seed, never a user's old SQLite.
    try {migrate(sqlite); seedTraining(sqlite, importTkiRelease(sqlite)); await importDemoSnapshot(client, exportDemoSnapshot(sqlite));}
    finally {sqlite.close();}
}
async function bootstrapFirst(client, login, password) {
  if (login !== "PEDPSY-OWNER") throw new Error("INVALID_OWNER_LOGIN");
  const {passwordRecord} = require("../storage/access.js"), record = await passwordRecord(password);
  // Existing owner-only, advisory-locked, one-use operation with mandatory audit.
  await client.query("SELECT pedpsy.bootstrap_first_superadmin($1,$2,$3,$4,$5)", [randomUUID(), randomUUID(), login, record.salt, record.password_hash]);
}
function runtimeEnvironment(c, inherited = process.env) {
  validateConfig(c, "runtime");
  const env = Object.fromEntries(Object.entries(inherited).filter(([key]) => !/^PG|^PEDPSY_/i.test(key)));
  return {...env, PEDPSY_PG_DEMO: "1", PGHOST: c.host, PGPORT: String(c.port), PGDATABASE: c.database, PGUSER: c.user,
    PGPASSWORD: c.password, PEDPSY_MFA_KEY: c.mfaKey,
    ...(c.contactDemo === true ? {PEDPSY_CONTACT_DEMO:"1",PEDPSY_CONTACT_KEY:c.contactKey} : {})};
}
async function main(command) {
  if (command === "secrets") {initializeSecrets(); return;}
  if (command === "configure") {configureCluster(); return;}
  if (command === "prepare") {
    const c = JSON.parse(fs.readFileSync(path.join(directory, "control.json"), "utf8"));
    if (c.host !== "127.0.0.1" || c.port !== 55432 || c.user !== "postgres" || c.database !== "postgres" || !/^[a-f0-9]{64}$/.test(c.password)) throw new Error("INVALID_CONTROL_CONFIG");
    const pool = new Pool(pgConfig(c));
    try {await createDemoDatabase(pool, readConfig("owner"), readConfig("runtime")); console.log("Local synthetic database prepared; no staff account or session created.");}
    finally {await pool.end();} return;
  }
  if (command === "bootstrap") {
    // Password comes only from the user's masked PowerShell prompt over stdin.
    // Never accept it through arguments, environment, a file or an HTTP route.
    let input = "";
    for await (const chunk of process.stdin) {input += chunk; if (Buffer.byteLength(input) > 2048) throw new Error("INPUT_LIMIT");}
    let request = JSON.parse(input); input = "";
    if (request.confirm !== "FIRST_LOCAL_SYNTHETIC_SUPERADMIN") throw new Error("EXPLICIT_BOOTSTRAP_REQUIRED");
    const pool = new Pool(pgConfig(readConfig("owner"))), client = await pool.connect();
    try {await bootstrapFirst(client, "PEDPSY-OWNER", request.password); console.log("PEDPSY-OWNER created. Password alone is not a session; complete MFA at http://127.0.0.1:4174/workspace");}
    finally {request.password = ""; request = null; client.release(); await pool.end();} return;
  }
  if (command === "serve") {
    const child = spawn(process.execPath, [path.join(root, "dist", "src", "bootstrap", "postgres-server.js")],
      {cwd: root, env: runtimeEnvironment(readConfig("runtime")), stdio: "inherit", windowsHide: true});
    child.on("error", () => {console.error("Local server could not start."); process.exitCode = 1;});
    child.on("exit", code => {process.exitCode = code ?? 1;});
    for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal)); return;
  }
  throw new Error("UNKNOWN_LOCAL_COMMAND");
}
if (require.main === module) main(process.argv[2]).catch(error => {
  // SQL errors may include bound credentials. Do not print message/detail/cause.
  console.error("Local operation failed; existing data preserved.", /^[A-Z0-9_]{2,64}$/.test(error.code || "") ? error.code : "CHECK_LOCAL_SETUP"); process.exitCode = 1;
});
module.exports = {validateConfig, createDemoDatabase, prepareOwnedDatabase, bootstrapFirst, runtimeEnvironment};
