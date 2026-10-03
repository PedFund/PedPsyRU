"use strict";
const path = require("node:path");
const {execFileSync} = require("node:child_process");
const {repositoryFiles} = require("./check-architecture.js");
const root = path.resolve(__dirname, "..");
const {files} = repositoryFiles(root);
for (const file of files.filter(p => p.endsWith(".js"))) {
  execFileSync(process.execPath, ["--check", path.join(root, file)], {stdio: "inherit"});
}
console.log("JavaScript syntax checks passed.");
