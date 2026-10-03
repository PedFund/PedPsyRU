"use strict";
const {randomUUID} = require("node:crypto");
const {openDatabase, migrate} = require("../storage/database.js");
const {importTkiRelease,responsesDigest} = require("../storage/releases.js");
const {seedTraining} = require("../storage/seed.js");
const {createParticipantAccess} = require("../storage/access.js");
const {SqliteUnitOfWork} = require("../dist/src/adapters/sqlite/unit-of-work.js");
const {createParticipationService} = require("../dist/src/application/participation.js");
const {responses} = require("./storage-contract-suite.js");
async function completedSnapshotSource() {
  const db = openDatabase(); migrate(db); const seed = seedTraining(db, importTkiRelease(db));
  const study = seed.studies[0], attempt = study.attempts[0];
  const access = createParticipantAccess(db), password = randomUUID()+randomUUID();
  await access.provision({study_id: study.id, participant_id: study.participants[0].id, login_id: "SYNTHETIC-SNAPSHOT", password});
  const session = await access.login({login_id: "SYNTHETIC-SNAPSHOT", password});
  const uow = new SqliteUnitOfWork(db, access), context = uow.context(session.token);
  const service = createParticipationService(uow, {newId:randomUUID,now:()=>new Date().toISOString(),digest:(ids,values)=>responsesDigest(ids.map(item_id=>({item_id})),values)});
  const before = await service.read(context, attempt.id);
  const saved = await service.save(context, attempt.id, {expected_revision:before.revision,current_item_id:"q30",responses:responses()});
  const result = await service.complete(context, attempt.id, {expected_revision:saved.revision});
  return {db, seed, result, attemptId:attempt.id, session};
}
module.exports = {completedSnapshotSource};
