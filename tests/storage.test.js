"use strict";

const {test} = require("node:test");
const assert = require("node:assert/strict");
const {randomUUID} = require("node:crypto");
const {DatabaseSync} = require("node:sqlite");
const {mkdtempSync, readFileSync, writeFileSync, rmSync} = require("node:fs");
const {tmpdir} = require("node:os");
const path = require("node:path");
const {openDatabase,migrate,transaction,sha256} = require("../storage/database.js");
const {canonicalJson,releasePackage,importTkiRelease,responsesDigest} = require("../storage/releases.js");
const {seedTraining} = require("../storage/seed.js");
const {scoreTki,CONTRACT_VERSION,METHOD_VERSION_ID,HANDLER_VERSION} = require("../core/tki-contract.js");
const form = require("../methods/tki/form.json");
const migrationSql = readFileSync(path.join(__dirname,"../storage/migrations/001_training.sql"),"utf8");

function temporaryDirectory(t) {
  const directory = mkdtempSync(path.join(tmpdir(),"pedpsy-storage-test-"));
  t.after(() => {
    // Only the exact newly-created test directory, never a workspace/home.
    assert.equal(path.dirname(directory), path.resolve(tmpdir()));
    assert.ok(path.basename(directory).startsWith("pedpsy-storage-test-"));
    rmSync(directory,{recursive:true,force:true});
  });
  return directory;
}
function setup(t) {
  const db = openDatabase(); t.after(() => db.close());
  migrate(db);
  const releaseId = importTkiRelease(db);
  const manifest = seedTraining(db,releaseId);
  return {db,releaseId,manifest,study:manifest.studies[0],other:manifest.studies[1],attempt:manifest.studies[0].attempts[0]};
}
function insertAttempt(db,s,a,releaseId,changes={}) {
  const row = {id:randomUUID(),study_id:s.id,enrollment_id:a.enrollment_id,assignment_id:a.assignment_id,
    group_id:a.group_id,stage_id:a.stage_id,release_id:releaseId,current_item_id:"q01",...changes};
  return db.prepare(`INSERT INTO attempts(id,study_id,enrollment_id,assignment_id,group_id,stage_id,release_id,current_item_id)
    VALUES(?,?,?,?,?,?,?,?)`).run(...Object.values(row));
}
function addResponse(db,study,attempt,releaseId,item="q03",value="A") {
  return db.prepare("INSERT INTO responses(study_id,attempt_id,release_id,item_id,value) VALUES(?,?,?,?,?)")
    .run(study.id,attempt.id,releaseId,item,value);
}
function fillDraft(db,study,attempt,releaseId) {
  const insert = db.prepare("INSERT OR IGNORE INTO responses(study_id,attempt_id,release_id,item_id,value) VALUES(?,?,?,?,?)");
  form.items.forEach(item => insert.run(study.id,attempt.id,releaseId,item.id,"A"));
}
function resultRow(db,study,attempt,releaseId,inputRevision=1) {
  const responses = db.prepare("SELECT item_id,value FROM responses WHERE attempt_id=? ORDER BY item_id").all(attempt.id);
  const payload = scoreTki({contract_version:CONTRACT_VERSION,method_version_id:METHOD_VERSION_ID,handler_version:HANDLER_VERSION,responses});
  const row = {id:randomUUID(),study_id:study.id,attempt_id:attempt.id,release_id:releaseId,input_revision:inputRevision,
    responses_digest:responsesDigest(form.items,responses),contract_version:CONTRACT_VERSION,handler_version:HANDLER_VERSION,
    key_digest:payload.calculation.key_digest,payload:JSON.stringify(payload)};
  return row;
}
function insertResult(db,row) {
  return db.prepare(`INSERT INTO attempt_results(id,study_id,attempt_id,release_id,input_revision,responses_digest,
    contract_version,handler_version,key_digest,payload) VALUES(?,?,?,?,?,?,?,?,?,?)`).run(...Object.values(row));
}
// Test-only SQL exercising schema guards, NOT an implemented completion service.
function schemaComplete(db,study,attempt,releaseId) {
  return transaction(db,() => {
    fillDraft(db,study,attempt,releaseId);
    const result = resultRow(db,study,attempt,releaseId);
    insertResult(db,result);
    db.prepare("UPDATE attempts SET status='completed',revision=revision+1,completion_result_id=?,completed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?")
      .run(result.id,attempt.id);
    return result;
  });
}

test("migration creates 13 domain tables with FK enabled and is repeatable", t => {
  const db = openDatabase();t.after(() => db.close());
  assert.equal(migrate(db),1);assert.equal(migrate(db),0);
  assert.equal(db.prepare("PRAGMA foreign_keys").get().foreign_keys,1);
  const tables = db.prepare("SELECT name FROM sqlite_schema WHERE type='table'").all().map(row => row.name);
  for (const table of ["users","study_memberships","studies","research_groups","research_stages","instrument_releases","release_items","assignments","participants","stage_enrollments","attempts","responses","attempt_results"]) assert.ok(tables.includes(table));
  assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(),[]);
  assert.equal(db.prepare("PRAGMA integrity_check").get().integrity_check,"ok");
});
test("migration checksum, gaps and unknown history fail closed", t => {
  const db = openDatabase();t.after(() => db.close());migrate(db);
  const directory = temporaryDirectory(t);
  writeFileSync(path.join(directory,"001_training.sql"),migrationSql+"\n-- altered", "utf8");
  assert.throws(() => migrate(db,directory),/MIGRATION_HISTORY_MISMATCH/);
  assert.equal(db.prepare("SELECT count(*) AS n FROM studies").get().n,0);
  writeFileSync(path.join(directory,"001_training.sql"),migrationSql,"utf8");
  writeFileSync(path.join(directory,"003_extra.sql"),"SELECT 1;","utf8");
  assert.throws(() => migrate(db,directory),/MIGRATION_SEQUENCE_INVALID/);
  db.prepare("UPDATE schema_migrations SET version=2 WHERE version=1").run();
  assert.throws(() => migrate(db),/MIGRATION_HISTORY_MISMATCH/);
});
test("failed multi-migration transaction leaves no partial schema", t => {
  const db = openDatabase();t.after(() => db.close());
  const directory = temporaryDirectory(t);
  writeFileSync(path.join(directory,"001_first.sql"),"CREATE TABLE first(id INTEGER) STRICT;","utf8");
  writeFileSync(path.join(directory,"002_broken.sql"),"THIS IS NOT SQL;","utf8");
  assert.throws(() => migrate(db,directory));
  assert.equal(db.prepare("SELECT count(*) AS n FROM sqlite_schema WHERE type='table'").get().n,0);
  assert.equal(db.isTransaction,false);
});
test("existing unrelated database is refused without modification", t => {
  let read; t.after(() => {if (read?.isOpen) read.close();});
  const filename = path.join(temporaryDirectory(t),"unrelated.sqlite");
  const raw = new DatabaseSync(filename);raw.exec("CREATE TABLE unrelated(id INTEGER) STRICT; INSERT INTO unrelated VALUES(42)");raw.close();
  assert.throws(() => openDatabase(filename),/NOT_A_TRAINING_DATABASE/);
  read = new DatabaseSync(filename,{readOnly:true});
  assert.equal(read.prepare("SELECT id FROM unrelated").get().id,42);
  assert.equal(read.prepare("PRAGMA application_id").get().application_id,0);
});
test("synthetic seed has two studies, separate groups and T0/T1/T2; repeat changes nothing", t => {
  const {db,releaseId,manifest,study,attempt}=setup(t);
  assert.equal(manifest.synthetic,true);
  for (const [table,n] of Object.entries({studies:2,research_groups:4,research_stages:6,participants:6,assignments:12,stage_enrollments:18,attempts:18,responses:4,attempt_results:0,release_items:30})) {
    assert.equal(db.prepare(`SELECT count(*) AS n FROM ${table}`).get().n,n,table);
  }
  assert.ok(db.prepare("SELECT dataset_kind FROM studies").all().every(row => row.dataset_kind==="demo"));
  assert.deepEqual(study.stages.map(s => s.code),["T0","T1","T2"]);
  assert.equal(db.prepare("SELECT count(*) AS n FROM responses r JOIN attempts a ON a.id=r.attempt_id JOIN research_stages s ON s.id=a.stage_id WHERE s.code<>'T0'").get().n,0);
  db.prepare("UPDATE responses SET value='B' WHERE attempt_id=? AND item_id='q01'").run(attempt.id);
  assert.deepEqual(seedTraining(db,releaseId),manifest);
  assert.equal(db.prepare("SELECT value FROM responses WHERE attempt_id=? AND item_id='q01'").get(attempt.id).value,"B");
  assert.throws(() => seedTraining(db,randomUUID()),/SEED_VERSION_MISMATCH/);
});
test("seed failure rolls back all synthetic participants and studies", t => {
  const db = openDatabase();t.after(() => db.close());migrate(db);
  assert.throws(() => seedTraining(db,randomUUID()));
  for (const table of ["users","studies","participants","attempts","seed_runs"]) assert.equal(db.prepare(`SELECT count(*) AS n FROM ${table}`).get().n,0);
});
test("canonical JSON v1 ignores object-key order but not array/text changes", () => {
  assert.equal(canonicalJson({z:1,a:{y:2,b:3}}),'{"a":{"b":3,"y":2},"z":1}');
  assert.equal(sha256(canonicalJson({a:1,b:2})),sha256(canonicalJson({b:2,a:1})));
  assert.notEqual(sha256(canonicalJson(["а","б"])),sha256(canonicalJson(["б","а"])));
  assert.notEqual(sha256(canonicalJson("текст")),sha256(canonicalJson("текст ")));
  assert.throws(() => canonicalJson({a:undefined}),/NON_JSON_VALUE/);
});
test("release import pins existing key and original form/items without duplicating", t => {
  const {db,releaseId}=setup(t);
  assert.equal(importTkiRelease(db),releaseId);
  const release = db.prepare("SELECT * FROM instrument_releases WHERE id=?").get(releaseId);
  assert.equal(release.key_digest,"sha256:45bc0c8a1b3f154fb3da5df629da6c42613609633594c4f5f54014a301cded7d");
  assert.equal(release.form_snapshot,canonicalJson(form));
  assert.equal(release.form_digest,sha256(canonicalJson(form)));
  assert.equal(release.publication_state,"draft");
  const items = db.prepare("SELECT * FROM release_items WHERE release_id=? ORDER BY ordinal").all(releaseId);
  assert.deepEqual(items.map(item => JSON.parse(item.options)),form.items.map(item => item.options));
  assert.equal(db.prepare("SELECT count(*) AS n FROM instrument_releases").get().n,1);
});
test("used release, its questions and attempt identity cannot be changed", t => {
  const {db,releaseId,attempt}=setup(t);
  assert.throws(() => db.prepare("UPDATE instrument_releases SET handler_version=handler_version WHERE id=?").run(releaseId),/immutable release/);
  assert.throws(() => db.prepare("DELETE FROM instrument_releases WHERE id=?").run(releaseId),/immutable release/);
  assert.throws(() => db.prepare("INSERT OR REPLACE INTO instrument_releases SELECT * FROM instrument_releases WHERE id=?").run(releaseId),/immutable release/);
  assert.throws(() => db.prepare("UPDATE release_items SET options=options WHERE release_id=?").run(releaseId),/frozen/);
  assert.throws(() => db.prepare("DELETE FROM release_items WHERE release_id=?").run(releaseId),/frozen/);
  assert.throws(() => db.prepare("INSERT INTO release_items SELECT * FROM release_items WHERE release_id=? AND item_id='q01'").run(releaseId),/frozen/);
  assert.throws(() => db.prepare("UPDATE attempts SET release_id=release_id WHERE id=?").run(attempt.id),/frozen/);
  assert.throws(() => db.prepare("INSERT OR REPLACE INTO attempts SELECT * FROM attempts WHERE id=?").run(attempt.id),/frozen/);
});
test("reimport detects a corrupted unassigned release snapshot", t => {
  const db = openDatabase();t.after(() => db.close());migrate(db);const releaseId=importTkiRelease(db);
  db.prepare("DELETE FROM release_items WHERE release_id=? AND item_id='q30'").run(releaseId);
  assert.throws(() => importTkiRelease(db),/RELEASE_SNAPSHOT_CHANGED/);
  const study=randomUUID(),group=randomUUID(),stage=randomUUID();
  db.prepare("INSERT INTO studies(id,title) VALUES(?,'synthetic')").run(study);
  db.prepare("INSERT INTO research_groups(id,study_id,name,kind) VALUES(?,?,'group','other')").run(group,study);
  db.prepare("INSERT INTO research_stages(id,study_id,code,ordinal) VALUES(?,?,'T0',0)").run(stage,study);
  assert.throws(() => db.prepare("INSERT INTO assignments(id,study_id,group_id,stage_id,release_id) VALUES(?,?,?,?,?)").run(randomUUID(),study,group,stage,releaseId),/30 items/);
});
test("real data mode, invalid statuses and negative revisions are rejected", t => {
  const {db,study,attempt}=setup(t);
  assert.throws(() => db.prepare("UPDATE studies SET dataset_kind='real' WHERE id=?").run(study.id),/CHECK/);
  assert.throws(() => db.prepare("INSERT INTO studies(id,title,dataset_kind) VALUES(?,'synthetic','real')").run(randomUUID()),/CHECK/);
  assert.throws(() => db.prepare("UPDATE attempts SET status='unknown' WHERE id=?").run(attempt.id),/CHECK/);
  assert.throws(() => db.prepare("UPDATE attempts SET revision=-1 WHERE id=?").run(attempt.id),/CHECK/);
  assert.throws(() => db.prepare("UPDATE attempts SET revision=1.5 WHERE id=?").run(attempt.id));
});
test("participants, groups and stages cannot cross study boundaries", t => {
  const {db,study,other,releaseId}=setup(t);
  assert.throws(() => db.prepare("INSERT INTO assignments(id,study_id,group_id,stage_id,release_id) VALUES(?,?,?,?,?)").run(randomUUID(),study.id,other.groups[0].id,study.stages[0].id,releaseId),/FOREIGN KEY/);
  assert.throws(() => db.prepare("INSERT INTO assignments(id,study_id,group_id,stage_id,release_id) VALUES(?,?,?,?,?)").run(randomUUID(),study.id,study.groups[0].id,other.stages[0].id,releaseId),/FOREIGN KEY/);
  assert.throws(() => db.prepare("INSERT INTO stage_enrollments(id,study_id,participant_id,group_id,stage_id) VALUES(?,?,?,?,?)").run(randomUUID(),study.id,other.participants[0].id,study.groups[0].id,study.stages[0].id),/FOREIGN KEY/);
  assert.throws(() => db.prepare("UPDATE research_stages SET based_on_stage_id=? WHERE id=?").run(other.stages[0].id,study.stages[1].id),/FOREIGN KEY/);
});
test("study scoped uniqueness allows the same code elsewhere but not duplicate stage/participant/assignment", t => {
  const {db,study,releaseId}=setup(t);
  assert.throws(() => db.prepare("INSERT INTO participants(id,study_id,display_code) VALUES(?,?,'DEMO-001')").run(randomUUID(),study.id),/UNIQUE/);
  assert.throws(() => db.prepare("INSERT INTO research_stages(id,study_id,code,ordinal) VALUES(?,?,'T0',10)").run(randomUUID(),study.id),/UNIQUE/);
  assert.throws(() => db.prepare("INSERT INTO research_stages(id,study_id,code,ordinal) VALUES(?,?,'T9',0)").run(randomUUID(),study.id),/UNIQUE/);
  assert.throws(() => db.prepare("INSERT INTO assignments(id,study_id,group_id,stage_id,release_id) VALUES(?,?,?,?,?)").run(randomUUID(),study.id,study.groups[0].id,study.stages[0].id,releaseId),/UNIQUE/);
  assert.throws(() => db.prepare("INSERT INTO stage_enrollments(id,study_id,participant_id,group_id,stage_id) VALUES(?,?,?,?,?)").run(randomUUID(),study.id,study.participants[0].id,study.groups[1].id,study.stages[0].id),/UNIQUE/);
});
test("attempt must match enrollment group, stage, assignment and study; no duplicates", t => {
  const {db,study,other,attempt,releaseId}=setup(t);
  assert.throws(() => insertAttempt(db,study,attempt,releaseId),/UNIQUE/);
  assert.throws(() => insertAttempt(db,other,attempt,releaseId),/FOREIGN KEY/);
  const eg=study.attempts.find(a => a.group_id===study.groups[1].id && a.stage_id===attempt.stage_id);
  assert.throws(() => insertAttempt(db,study,attempt,releaseId,{assignment_id:eg.assignment_id,group_id:eg.group_id}),/FOREIGN KEY/);
  const t1=study.attempts[1];
  assert.throws(() => insertAttempt(db,study,attempt,releaseId,{assignment_id:t1.assignment_id,stage_id:t1.stage_id}),/FOREIGN KEY/);
  db.prepare("DELETE FROM attempts WHERE id=?").run(t1.id); // Empty draft: avoid UNIQUE masking the FK check.
  assert.throws(() => insertAttempt(db,study,t1,randomUUID()),/FOREIGN KEY/);
});
test("enrollment and assignment scope freeze after an attempt starts", t => {
  const {db,study,attempt}=setup(t);
  assert.throws(() => db.prepare("UPDATE stage_enrollments SET group_id=? WHERE id=?").run(study.groups[1].id,attempt.enrollment_id),/already has attempts/);
  assert.throws(() => db.prepare("UPDATE assignments SET stage_id=? WHERE id=?").run(study.stages[1].id,attempt.assignment_id),/already has attempts/);
  assert.throws(() => db.prepare("INSERT OR REPLACE INTO stage_enrollments SELECT * FROM stage_enrollments WHERE id=?").run(attempt.enrollment_id),/already has attempts/);
  assert.throws(() => db.prepare("INSERT OR REPLACE INTO assignments SELECT * FROM assignments WHERE id=?").run(attempt.assignment_id),/already has attempts/);
});
test("responses and slide are constrained by item, scope, release and canonical A/B", t => {
  const {db,study,other,attempt,releaseId}=setup(t);
  for (const value of ["C","А","Б","a","",null,1]) assert.throws(() => addResponse(db,study,attempt,releaseId,"q03",value));
  assert.throws(() => addResponse(db,study,attempt,releaseId,"q31"),/FOREIGN KEY/);
  assert.throws(() => addResponse(db,other,attempt,releaseId),/FOREIGN KEY/);
  assert.throws(() => addResponse(db,study,attempt,randomUUID()),/FOREIGN KEY/);
  assert.throws(() => addResponse(db,study,attempt,releaseId,"q01"),/UNIQUE/);
  assert.throws(() => db.prepare("UPDATE attempts SET current_item_id='q31' WHERE id=?").run(attempt.id),/FOREIGN KEY/);
  assert.equal(db.prepare("SELECT count(*) AS n FROM responses WHERE attempt_id=?").get(attempt.id).n,2);
});
test("responses digest follows release order, rejects duplicates and missing differs from A", () => {
  const answers=[{item_id:"q01",value:"A"},{item_id:"q21",value:"B"}];
  assert.equal(responsesDigest(form.items,answers),responsesDigest(form.items,[...answers].reverse()));
  assert.notEqual(responsesDigest(form.items,answers),responsesDigest(form.items,answers.slice(0,1)));
  assert.throws(() => responsesDigest(form.items,[...answers,answers[0]]),/INVALID_RESPONSES/);
  assert.throws(() => responsesDigest(form.items,[{item_id:"q99",value:"A"}]),/INVALID_RESPONSES/);
  assert.throws(() => responsesDigest(form.items,[{item_id:"q01",value:"А"}]),/INVALID_RESPONSES/);
});
test("file restart retains synthetic draft, slide, revision and release", t => {
  let db; t.after(() => {if (db?.isOpen) db.close();});
  const filename=path.join(temporaryDirectory(t),"training.sqlite");
  db=openDatabase(filename);migrate(db);const releaseId=importTkiRelease(db);const manifest=seedTraining(db,releaseId);
  const id=manifest.studies[0].attempts[0].id;db.close();
  db=openDatabase(filename);assert.equal(migrate(db),0);
  const attempt=db.prepare("SELECT * FROM attempts WHERE id=?").get(id);
  assert.equal(attempt.current_item_id,"q03");assert.equal(attempt.revision,1);assert.equal(attempt.release_id,releaseId);
  assert.deepEqual(db.prepare("SELECT item_id,value FROM responses WHERE attempt_id=? ORDER BY item_id").all(id).map(row => ({...row})),[{item_id:"q01",value:"A"},{item_id:"q02",value:"B"}]);
  assert.deepEqual(seedTraining(db,releaseId),manifest);
});
test("transaction rollback restores draft and revision; async/nested callbacks are refused", t => {
  const {db,study,attempt,releaseId}=setup(t);
  assert.throws(() => transaction(db,() => {addResponse(db,study,attempt,releaseId);db.prepare("UPDATE attempts SET revision=2 WHERE id=?").run(attempt.id);throw new Error("injected failure");}),/injected failure/);
  assert.equal(db.prepare("SELECT revision FROM attempts WHERE id=?").get(attempt.id).revision,1);
  assert.equal(db.prepare("SELECT count(*) AS n FROM responses WHERE attempt_id=?").get(attempt.id).n,2);
  assert.throws(() => transaction(db,() => Promise.resolve()),/ASYNC/);
  assert.throws(() => transaction(db,() => transaction(db,() => 1)),/NESTED/);
});
test("schema rejects completed without result, orphan result and wrong input revision atomically", t => {
  const {db,study,attempt,releaseId}=setup(t);
  fillDraft(db,study,attempt,releaseId);
  assert.throws(() => transaction(db,() => db.prepare("UPDATE attempts SET status='completed',revision=2,completion_result_id=?,completed_at='2026-10-02T00:00:00Z' WHERE id=?").run(randomUUID(),attempt.id)),/input revision/);
  assert.throws(() => transaction(db,() => insertResult(db,resultRow(db,study,attempt,releaseId))),/FOREIGN KEY/);
  assert.throws(() => transaction(db,() => {
    const result=resultRow(db,study,attempt,releaseId,0);insertResult(db,result);
    db.prepare("UPDATE attempts SET status='completed',revision=2,completion_result_id=?,completed_at='2026-10-02T00:00:00Z' WHERE id=?").run(result.id,attempt.id);
  }),/input revision/);
  assert.equal(db.prepare("SELECT count(*) AS n FROM attempt_results").get().n,0);
  assert.equal(db.prepare("SELECT status FROM attempts WHERE id=?").get(attempt.id).status,"draft");
});
test("schema completion guards preserve exactly one immutable result and answers", t => {
  const {db,study,attempt,releaseId}=setup(t);const result=schemaComplete(db,study,attempt,releaseId);
  assert.equal(db.prepare("SELECT status FROM attempts WHERE id=?").get(attempt.id).status,"completed");
  assert.throws(() => insertResult(db,{...result,id:randomUUID()}),/UNIQUE/);
  assert.throws(() => db.prepare("UPDATE attempt_results SET payload=payload WHERE id=?").run(result.id),/immutable/);
  assert.throws(() => db.prepare("DELETE FROM attempt_results WHERE id=?").run(result.id),/immutable/);
  assert.throws(() => db.prepare("INSERT OR REPLACE INTO attempt_results SELECT * FROM attempt_results WHERE id=?").run(result.id),/immutable/);
  assert.throws(() => db.prepare("UPDATE attempts SET current_item_id='q02' WHERE id=?").run(attempt.id),/immutable/);
  assert.throws(() => db.prepare("DELETE FROM attempts WHERE id=?").run(attempt.id),/immutable/);
  assert.throws(() => db.prepare("UPDATE responses SET value='B' WHERE attempt_id=?").run(attempt.id),/draft/);
  assert.throws(() => db.prepare("DELETE FROM responses WHERE attempt_id=?").run(attempt.id),/draft/);
  assert.throws(() => db.prepare("INSERT OR REPLACE INTO responses(study_id,attempt_id,release_id,item_id,value) VALUES(?,?,?,'q01','B')").run(study.id,attempt.id,releaseId),/draft/);
  assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(),[]);
});
test("result must belong to same study/release and carry scored versioned payload", t => {
  const {db,study,other,attempt,releaseId}=setup(t);fillDraft(db,study,attempt,releaseId);
  for (const changes of [{study_id:other.id},{release_id:randomUUID()},{handler_version:"unknown"},{payload:"{}"},{payload:JSON.stringify({status:"incomplete"})}]) {
    assert.throws(() => transaction(db,() => insertResult(db,{...resultRow(db,study,attempt,releaseId),...changes})));
  }
  assert.equal(db.prepare("SELECT count(*) AS n FROM attempt_results").get().n,0);
});
