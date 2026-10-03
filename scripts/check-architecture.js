"use strict";
const fs = require("node:fs");
const path = require("node:path");
const {execFileSync} = require("node:child_process");
const {isBuiltin} = require("node:module");
const runtimeFile = p => /^(core\/|storage\/|web\/|methods\/|processor\.js$|methods\.js$)/.test(p) && p.endsWith(".js");
const mathFile = p => /^(core\/|methods\/|processor\.js$|methods\.js$)/.test(p);

function repositoryFiles(root) {
  try {
    const top = execFileSync("git", ["rev-parse", "--show-toplevel"], {cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"]}).trim();
    if (path.resolve(top).toLowerCase() !== path.resolve(root).toLowerCase()) throw new Error("Wrong Git root");
    return {tracked: true, files: execFileSync("git", ["ls-files", "-z"], {cwd: root, encoding: "utf8"}).split("\0").filter(Boolean)};
  } catch (error) {
    if (process.env.CI) throw new Error("CI requires a Git checkout of this project", {cause: error});
    const files = [];
    function walk(dir) {
      for (const entry of fs.readdirSync(path.join(root, dir), {withFileTypes: true})) {
        if ([".git", ".local", "node_modules"].includes(entry.name)) continue;
        const name = path.posix.join(dir, entry.name);
        if (entry.isSymbolicLink()) throw new Error("Symlink requires review: " + name);
        if (entry.isDirectory()) walk(name); else files.push(name);
      }
    }
    walk("");
    return {tracked: false, files};
  }
}

function checkArchitecture(files, sources, manifest, approvedPackages = []) {
  const errors = [], graph = new Map();
  const available = new Set(files);
  const forbidden = /(^|\/)(?:\.local|node_modules|data\/raw|outputs?|Data)(?:\/|$)|\.(?:sqlite(?:-.*)?|db|xlsx?|zip|pem|p12|pfx)$/i;
  for (const file of files) {
    if (forbidden.test(file) || /(^|\/)\.env(?:\.|$)/.test(file) && !file.endsWith(".env.example")) errors.push("Forbidden repository artifact: " + file);
  }
  const declared = {...manifest.dependencies, ...manifest.devDependencies, ...manifest.optionalDependencies, ...manifest.peerDependencies};
  for (const name of Object.keys(declared)) if (!approvedPackages.includes(name)) errors.push("Unreviewed package: " + name);
  for (const name of approvedPackages) if (!Object.hasOwn(declared, name)) errors.push("Stale package register: " + name);
  for (const file of files.filter(runtimeFile)) {
    const source = sources[file];
    if (typeof source !== "string") {errors.push("Missing source: " + file); continue;}
    // A deliberately narrow check for the pilot's literal CommonJS imports.
    // This is a dependency regression guard, not a JavaScript security parser.
    const calls = [...source.matchAll(/\brequire\s*\(/g)];
    const imports = [...source.matchAll(/\brequire\s*\(\s*(["'])([^"']+)\1\s*\)/g)].map(m => m[2]);
    if (calls.length !== imports.length || /\bimport\s*\(|^\s*import(?:\s|["'{*])/m.test(source)) errors.push("Unsupported dynamic/ESM dependency; review guard first: " + file);
    const edges = [];
    for (const specifier of imports) {
      if (isBuiltin(specifier)) {
        if (mathFile(file) && specifier !== "node:crypto") errors.push("Calculation core imports I/O or runtime module: " + file + " -> " + specifier);
        continue;
      }
      if (!specifier.startsWith(".")) {
        const name = specifier.startsWith("@") ? specifier.split("/").slice(0, 2).join("/") : specifier.split("/")[0];
        if (!Object.hasOwn(manifest.dependencies || {}, name)) errors.push("Undeclared runtime package: " + file + " -> " + name);
        if (mathFile(file)) errors.push("Calculation core imports external package: " + file);
        continue;
      }
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier));
      if (!available.has(target)) errors.push("Missing or external relative dependency: " + file + " -> " + target);
      if (mathFile(file) && !mathFile(target) && !/^methods\/.*\.json$/.test(target)) errors.push("Calculation core crosses boundary: " + file + " -> " + target);
      if (file.startsWith("storage/") && /^(web|tests|scripts)\//.test(target)) errors.push("Storage crosses boundary: " + file + " -> " + target);
      if (target.endsWith(".js")) edges.push(target);
    }
    graph.set(file, edges);
  }
  const active = new Set(), done = new Set();
  function visit(file) {
    if (active.has(file)) {errors.push("Circular runtime dependency: " + file); return;}
    if (done.has(file)) return;
    active.add(file);
    for (const target of graph.get(file) || []) visit(target);
    active.delete(file); done.add(file);
  }
  for (const file of graph.keys()) visit(file);
  return errors;
}

if (require.main === module) {
  const root = path.resolve(__dirname, "..");
  const {files, tracked} = repositoryFiles(root);
  const sources = Object.fromEntries(files.filter(runtimeFile).map(p => [p, fs.readFileSync(path.join(root, p), "utf8")]));
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  const register = JSON.parse(fs.readFileSync(path.join(root, "dependency-policy.json"), "utf8"));
  const errors = checkArchitecture(files, sources, manifest, register.approvedNpmPackages);
  if (errors.length) {console.error(errors.join("\n")); process.exitCode = 1;}
  else console.log("Architecture/package/artifact checks passed (" + (tracked ? "Git tracked files" : "local files; Git index not verified") + ").");
}
module.exports = {checkArchitecture, repositoryFiles};
