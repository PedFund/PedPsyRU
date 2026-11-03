"use strict";
const {studyResearcher} = require("./study-fixture.js");
const {PostgresGroupInvitations} = require("../dist/src/adapters/postgres/group-invitations.js");
async function invitationResearcher(f, staff) {
  const x = await studyResearcher(f, staff);
  let d = await x.studies.create(x.session.token, "Synthetic recruitment");
  d = await x.studies.group(x.session.token, d.id, undefined,
    {name: "КГ", kind: "control", expected_version: d.version});
  for (const g of d.groups) d = await x.studies.assign(x.session.token, d.id,
    {group_id: g.id, stage_id: d.stages[0].id, release_ids: [f.seed.release_id], expected_version: d.version});
  d = await x.studies.lifecycle(x.session.token, d.id, {status: "active", expected_version: d.version});
  return {...x, design: d, invitations: new PostgresGroupInvitations(f.runtime)};
}
module.exports = {invitationResearcher};
