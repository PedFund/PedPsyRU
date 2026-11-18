"use strict";
// Static logging guard: the application must not write to stdout/stderr beyond the
// two documented startup messages, so request data and personal data can never
// leak through console output. The access log, if added later, must be explicit.
const {test}=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const root=path.join(__dirname,"..","src");
const POSIX=file=>path.relative(root,file).split(path.sep).join("/");
function files(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>{const full=path.join(dir,entry.name);return entry.isDirectory()?files(full):entry.name.endsWith(".ts")?[full]:[];});}
test("application code writes no console output except the two startup messages",()=>{
  const found=[];
  for(const file of files(root)){
    const source=fs.readFileSync(file,"utf8");
    for(const _ of source.matchAll(/console\.(log|info|warn|error)\(/g))found.push(POSIX(file));
  }
  assert.deepEqual([...new Set(found)].sort(),["bootstrap/postgres-server.ts","bootstrap/workspace-preview.ts"],"only startup diagnostics may use the console");
});
test("no console call interpolates request data or personal data",()=>{
  const forbidden=/\b(request|headers|body|cookies?|token|email|password|csrf|answers?|participant)\b/i;
  for(const file of files(root)){
    const source=fs.readFileSync(file,"utf8");
    for(const match of source.matchAll(/console\.(log|info|warn|error)\(([^\n]*)/g))
      assert.doesNotMatch(match[2],forbidden,"no console call may interpolate request data in "+POSIX(file));
  }
});
