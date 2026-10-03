"use strict";
const fs = require("node:fs");
const path = require("node:path");
const {execFileSync} = require("node:child_process");
const root = path.resolve(__dirname, "..");
execFileSync(process.execPath, [require.resolve("typescript/bin/tsc"), "--project", path.join(root, "tsconfig.json")], {cwd: root, stdio: "inherit"});
// Copy exactly the unchanged first-party JS scorer/data required by its imports.
// No database, credentials, node_modules, HTTP pilot or reports are copied.
for (const file of ["core/tki-contract.js", "processor.js", "methods.js", "methods/builtin.js", "methods/tki/keys/1.0.0.json",
  "methods/tki/form.json", "storage/releases.js", "storage/database.js", "storage/access.js", "web/workspace/index.html", "web/workspace/app.js", "web/workspace/styles.css"]) {
  const target = path.join(root, "dist", file);
  fs.mkdirSync(path.dirname(target), {recursive: true});
  fs.copyFileSync(path.join(root, file), target);
}
console.log("Strict TypeScript build complete; original scoring files copied byte-for-byte.");
