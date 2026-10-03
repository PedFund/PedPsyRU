"use strict";
const fs = require("node:fs");
const path = require("node:path");
const {execFileSync} = require("node:child_process");
const {isBuiltin} = require("node:module");
const ts = require("typescript");
const runtimeFile = p => /^(src\/|core\/|storage\/|web\/|methods\/|processor\.js$|methods\.js$)/.test(p) && /\.(?:[cm]?js|ts)$/.test(p);
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
        if ([".git", ".local", "node_modules", "dist"].includes(entry.name)) continue;
        const name = path.posix.join(dir, entry.name);
        if (entry.isSymbolicLink()) throw new Error("Symlink requires review: " + name);
        if (entry.isDirectory()) walk(name); else files.push(name);
      }
    }
    walk("");
    return {tracked: false, files};
  }
}

function extractImports(file, source) {
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true,
    file.endsWith(".ts") ? ts.ScriptKind.TS : ts.ScriptKind.JS);
  const imports = [], errors = [];
  if (ast.parseDiagnostics.length) errors.push("Invalid syntax: " + file);
  const add = (node, typeOnly = false) => {
    if (!node || !ts.isStringLiteral(node)) errors.push("Unsupported computed module loading: " + file);
    else imports.push({specifier: node.text, typeOnly});
  };
  function visit(node) {
    if (ts.isImportDeclaration(node)) add(node.moduleSpecifier, Boolean(node.importClause?.isTypeOnly));
    else if (ts.isExportDeclaration(node) && node.moduleSpecifier) add(node.moduleSpecifier, node.isTypeOnly);
    else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) add(node.moduleReference.expression, node.isTypeOnly);
    else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) add(node.argument.literal, true);
    else if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
      ts.isIdentifier(node.expression) && node.expression.text === "require")) {
      if (node.arguments.length !== 1) errors.push("Unsupported module arguments: " + file);
      else add(node.arguments[0]);
    } else if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) && ["require", "module"].includes(node.expression.expression.text)) {
      errors.push("Unsupported indirect module loading: " + file);
    } else if (ts.isIdentifier(node) && node.text === "require" &&
      !(ts.isCallExpression(node.parent) && node.parent.expression === node) &&
      !(ts.isPropertyAccessExpression(node.parent) && node.parent.expression === node && node.parent.name.text === "main")) {
      errors.push("Unsupported require alias: " + file);
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  return {imports, errors};
}

function relativeTarget(file, specifier, available) {
  const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier));
  const candidates = [target];
  if (target.endsWith(".js")) candidates.push(target.slice(0, -3) + ".ts", target.slice(0, -3) + ".d.ts");
  if (!path.posix.extname(target)) candidates.push(target + ".js", target + ".ts", target + ".d.ts", target + "/index.js", target + "/index.ts");
  return candidates.find(p => available.has(p)) || target;
}

function checkArchitecture(files, sources, manifest, approvedPackages = []) {
  const errors = [], graph = new Map();
  const available = new Set(files);
  const forbidden = /(^|\/)(?:\.local|node_modules|dist|data\/raw|outputs?|Data)(?:\/|$)|\.(?:sqlite(?:-.*)?|db|xlsx?|zip|pem|p12|pfx)$/i;
  for (const file of files) {
    if (forbidden.test(file) || /(^|\/)\.env(?:\.|$)/.test(file) && !file.endsWith(".env.example")) errors.push("Forbidden repository artifact: " + file);
  }
  const declared = {...manifest.dependencies, ...manifest.devDependencies, ...manifest.optionalDependencies, ...manifest.peerDependencies};
  for (const name of Object.keys(declared)) if (!approvedPackages.includes(name)) errors.push("Unreviewed package: " + name);
  for (const name of approvedPackages) if (!Object.hasOwn(declared, name)) errors.push("Stale package register: " + name);
  for (const file of files.filter(runtimeFile)) {
    const source = sources[file];
    if (typeof source !== "string") {errors.push("Missing source: " + file); continue;}
    const {imports, errors: parseErrors} = extractImports(file, source);
    errors.push(...parseErrors);
    const edges = [];
    for (const {specifier, typeOnly} of imports) {
      if (isBuiltin(specifier)) {
        if (mathFile(file) && specifier !== "node:crypto") errors.push("Calculation core imports I/O or runtime module: " + file + " -> " + specifier);
        if (/^src\/(ports|application|scoring)\//.test(file)) errors.push("Pure layer imports runtime module: " + file + " -> " + specifier);
        continue;
      }
      if (!specifier.startsWith(".")) {
        const name = specifier.startsWith("@") ? specifier.split("/").slice(0, 2).join("/") : specifier.split("/")[0];
        if (!Object.hasOwn(manifest.dependencies || {}, name)) errors.push("Undeclared runtime package: " + file + " -> " + name);
        if (mathFile(file)) errors.push("Calculation core imports external package: " + file);
        if (/^src\/(ports|application|scoring)\//.test(file)) errors.push("Pure layer imports external package: " + file);
        if (file.startsWith("src/http/") && name !== "fastify") errors.push("HTTP directly imports non-HTTP package: " + file + " -> " + name);
        if (file.startsWith("src/adapters/") && !(file.startsWith("src/adapters/postgres/") && name === "pg")) errors.push("Adapter imports unsupported package: " + file + " -> " + name);
        continue;
      }
      const target = relativeTarget(file, specifier, available);
      if (!available.has(target)) errors.push("Missing or external relative dependency: " + file + " -> " + target);
      if (mathFile(file) && !mathFile(target) && !/^methods\/.*\.json$/.test(target)) errors.push("Calculation core crosses boundary: " + file + " -> " + target);
      if (file.startsWith("storage/") && /^(web|tests|scripts)\//.test(target)) errors.push("Storage crosses boundary: " + file + " -> " + target);
      if (file.startsWith("src/")) {
        const layer = file.split("/")[1];
        const allowed = {
          ports: /^(src\/ports\/|core\/.*\.d\.ts$)/,
          application: /^(src\/(application|ports|scoring)\/)/,
          scoring: /^(src\/(scoring|ports)\/|core\/)/,
          adapters: /^(src\/(adapters|ports)\/|core\/|storage\/)/,
          http: /^(src\/(http|application|ports)\/)/,
          bootstrap: /^(src\/|storage\/)/
        }[layer];
        const declarationTarget = target.endsWith(".js") ? target.slice(0, -3) + ".d.ts" : target;
        if (!allowed || !allowed.test(target) && !(typeOnly && layer === "ports" && allowed.test(declarationTarget)))
          errors.push("Platform layer crosses boundary: " + file + " -> " + target);
      }
      if (/\.(?:[cm]?js|ts)$/.test(target)) edges.push(target);
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
module.exports = {checkArchitecture, repositoryFiles, extractImports};
