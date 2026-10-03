"use strict";
const fs = require("node:fs");
const path = require("node:path");
function checkLock(manifest, lock) {
  const errors = [], root = lock.packages?.[""];
  if (lock.lockfileVersion !== 3 || !root) return ["A version 3 lockfile is required"];
  for (const kind of ["dependencies", "devDependencies"]) {
    if (JSON.stringify(manifest[kind] || {}) !== JSON.stringify(root[kind] || {})) errors.push("Manifest/lock mismatch: " + kind);
    for (const [name, version] of Object.entries(manifest[kind] || {})) {
      if (!/^\d+\.\d+\.\d+$/.test(version)) errors.push("Direct version must be exact: " + name);
      if (lock.packages["node_modules/" + name]?.version !== version) errors.push("Missing exact lock entry: " + name);
    }
  }
  for (const [name, entry] of Object.entries(lock.packages || {})) {
    if (!name) continue;
    if (!/^https:\/\/registry\.npmjs\.org\//.test(entry.resolved || "")) errors.push("Non-registry dependency: " + name);
    if (!/^sha512-/.test(entry.integrity || "")) errors.push("Missing SHA-512 integrity: " + name);
    if (entry.hasInstallScript) errors.push("Install script needs separate review: " + name);
    if (!["MIT", "BSD-3-Clause", "ISC", "Apache-2.0"].includes(entry.license)) errors.push("License needs review: " + name);
  }
  return errors;
}
if (require.main === module) {
  const root = path.resolve(__dirname, "..");
  const errors = checkLock(JSON.parse(fs.readFileSync(path.join(root, "package.json"))), JSON.parse(fs.readFileSync(path.join(root, "package-lock.json"))));
  if (errors.length) {console.error(errors.join("\n")); process.exitCode = 1;}
  else console.log("Exact versions, registry origins, integrity, licenses and install scripts checked.");
}
module.exports = {checkLock};
