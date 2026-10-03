"use strict";

// Policy includes future manager responsibilities. Only read/export is implemented now.
const common=["studies.read_all","responses.read_all","responses.export_all","researchers.manage"];
const POLICY=Object.freeze({
  administrator:Object.freeze([...common]),
  superadministrator:Object.freeze([...common,"methods.manage"])
});
const IMPLEMENTED=Object.freeze(["studies.read_all","responses.read_all","responses.export_all"]);
const permits=(role,permission) => Object.hasOwn(POLICY,role) && POLICY[role].includes(permission);
module.exports={POLICY,IMPLEMENTED,permits};
