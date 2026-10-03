"use strict";

const {randomUUID} = require("node:crypto");
const {transaction, sha256} = require("./database.js");
const {canonicalJson} = require("./releases.js");
const SEED_NAME = "synthetic-training-v1";
const SEED_SPEC = {name: SEED_NAME, studies: 2, groups: ["control","experimental"], stages: ["T0","T1","T2"],
  participants: ["DEMO-001","DEMO-002","DEMO-003"], draft: [{item_id:"q01",value:"A"},{item_id:"q02",value:"B"}], current_item_id:"q03"};

function seedTraining(db, releaseId) {
  const sourceDigest = sha256(canonicalJson(SEED_SPEC));
  return transaction(db, () => {
    const existing = db.prepare("SELECT source_digest,manifest FROM seed_runs WHERE name=?").get(SEED_NAME);
    if (existing) {
      const manifest = JSON.parse(existing.manifest);
      if (existing.source_digest !== sourceDigest || manifest.release_id !== releaseId) throw new Error("SEED_VERSION_MISMATCH");
      // No reseeding/repair of changed answers: idempotent seed never overwrites a draft.
      return manifest;
    }
    const manifest = {synthetic: true, release_id: releaseId, studies: []};
    const userId = randomUUID();
    db.prepare("INSERT INTO users(id) VALUES(?)").run(userId);
    manifest.user_id = userId; // No credential or actual login created.
    for (let n = 0; n < SEED_SPEC.studies; n++) {
      const study = {id: randomUUID(), groups: [], stages: [], participants: [], assignments: [], attempts: []};
      db.prepare("INSERT INTO studies(id,title,status) VALUES(?,?,'active')").run(study.id, "СИНТЕТИЧЕСКОЕ исследование " + (n + 1));
      db.prepare("INSERT INTO study_memberships(study_id,user_id,role) VALUES(?,?,'researcher')").run(study.id, userId);
      for (const kind of SEED_SPEC.groups) {
        const group = {id: randomUUID(), kind};
        db.prepare("INSERT INTO research_groups(id,study_id,name,kind) VALUES(?,?,?,?)").run(group.id, study.id, kind === "control" ? "КГ (вымышленная)" : "ЭГ (вымышленная)", kind);
        study.groups.push(group);
      }
      for (const [ordinal, code] of SEED_SPEC.stages.entries()) {
        const stage = {id: randomUUID(), code};
        db.prepare("INSERT INTO research_stages(id,study_id,code,ordinal,based_on_stage_id) VALUES(?,?,?,?,?)")
          .run(stage.id, study.id, code, ordinal, ordinal ? study.stages[ordinal - 1].id : null);
        study.stages.push(stage);
        for (const group of study.groups) {
          const assignment = {id: randomUUID(), group_id: group.id, stage_id: stage.id};
          db.prepare("INSERT INTO assignments(id,study_id,group_id,stage_id,release_id) VALUES(?,?,?,?,?)")
            .run(assignment.id, study.id, group.id, stage.id, releaseId);
          study.assignments.push(assignment);
        }
      }
      for (const [index, code] of SEED_SPEC.participants.entries()) {
        const participant = {id: randomUUID(), display_code: code};
        db.prepare("INSERT INTO participants(id,study_id,display_code) VALUES(?,?,?)").run(participant.id, study.id, code);
        study.participants.push(participant);
        const group = study.groups[index === 2 ? 1 : 0];
        for (const stage of study.stages) {
          const enrollmentId = randomUUID();
          db.prepare("INSERT INTO stage_enrollments(id,study_id,participant_id,group_id,stage_id) VALUES(?,?,?,?,?)")
            .run(enrollmentId, study.id, participant.id, group.id, stage.id);
          const assignment = study.assignments.find(a => a.group_id === group.id && a.stage_id === stage.id);
          const attempt = {id: randomUUID(), enrollment_id: enrollmentId, assignment_id: assignment.id,
            participant_id: participant.id, group_id: group.id, stage_id: stage.id};
          db.prepare(`INSERT INTO attempts(id,study_id,enrollment_id,assignment_id,group_id,stage_id,release_id,current_item_id)
            VALUES(?,?,?,?,?,?,?,'q01')`).run(attempt.id, study.id, enrollmentId, assignment.id, group.id, stage.id, releaseId);
          study.attempts.push(attempt);
        }
      }
      const first = study.attempts[0];
      for (const response of SEED_SPEC.draft) {
        db.prepare("INSERT INTO responses(study_id,attempt_id,release_id,item_id,value) VALUES(?,?,?,?,?)")
          .run(study.id, first.id, releaseId, response.item_id, response.value);
      }
      db.prepare("UPDATE attempts SET current_item_id=?,revision=1 WHERE id=?").run(SEED_SPEC.current_item_id, first.id);
      manifest.studies.push(study);
    }
    db.prepare("INSERT INTO seed_runs(name,source_digest,manifest) VALUES(?,?,?)").run(SEED_NAME, sourceDigest, canonicalJson(manifest));
    return manifest;
  });
}

module.exports = {seedTraining, SEED_NAME};
