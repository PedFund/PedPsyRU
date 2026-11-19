"use strict";
// Access log contract: route template only, no query string, no body, no raw
// address. A configured path without a strong salt must fail closed.
const {test}=require("node:test"),assert=require("node:assert/strict");
const {accessLogConfig,accessLogLine,createAccessLog}=require("../dist/src/http/access-log.js");
const salt="s".repeat(48);
test("access log line keeps only the documented fields and hashes the address",()=>{
  const line=accessLogLine({method:"POST",route:"/api/v2/participant/attempts/:id/draft",status:200,durationMs:12.6,ip:"203.0.113.7",salt,now:1763500000000});
  const row=JSON.parse(line);
  assert.deepEqual(Object.keys(row).sort(),["duration_ms","ip_hash","method","route","status","ts"]);
  assert.equal(row.method,"POST");assert.equal(row.route,"/api/v2/participant/attempts/:id/draft");assert.equal(row.status,200);assert.equal(row.duration_ms,13);
  assert.match(row.ip_hash,/^[a-f0-9]{16}$/);
  assert.ok(!line.includes("203.0.113.7"),"the raw address never appears");
  assert.ok(!line.includes("?"),"no query string is logged");
  const same=JSON.parse(accessLogLine({method:"GET",route:"/health",status:200,durationMs:1,ip:"203.0.113.7",salt,now:1763500000000}));
  assert.equal(same.ip_hash,row.ip_hash,"the hash is stable for the same salt");
  const other=JSON.parse(accessLogLine({method:"GET",route:"/health",status:200,durationMs:1,ip:"203.0.113.8",salt,now:1763500000000}));
  assert.notEqual(other.ip_hash,row.ip_hash);
});
test("access log truncates long route templates and tolerates a missing address",()=>{
  const row=JSON.parse(accessLogLine({method:"GET",route:"/"+ "a".repeat(400),status:404,durationMs:0,ip:"",salt,now:0}));
  assert.equal(row.route.length,160);assert.equal(row.ip_hash,"");assert.equal(row.duration_ms,0);
});
test("access log is disabled without a path and fails closed without a strong salt",()=>{
  assert.equal(accessLogConfig({}),null);
  assert.deepEqual(accessLogConfig({PEDPSY_ACCESS_LOG_PATH:"/tmp/access.log",PEDPSY_ACCESS_LOG_SALT:salt}),{file:"/tmp/access.log",salt});
  assert.throws(()=>accessLogConfig({PEDPSY_ACCESS_LOG_PATH:"/tmp/access.log",PEDPSY_ACCESS_LOG_SALT:"short"}),/ACCESS_LOG_SALT_REQUIRED/);
  assert.throws(()=>accessLogConfig({PEDPSY_ACCESS_LOG_PATH:"/tmp/access.log"}),/ACCESS_LOG_SALT_REQUIRED/);
});
test("the handler writes one line through the injected sink",()=>{
  const lines=[];
  const hook=createAccessLog({file:"/nonexistent/ignored.log",salt},{write:line=>lines.push(line)});
  hook({method:"GET",ip:"198.51.100.9",routeOptions:{url:"/health"}},{statusCode:200,elapsedTime:3});
  assert.equal(lines.length,1);
  const row=JSON.parse(lines[0]);
  assert.equal(row.route,"/health");assert.equal(row.status,200);assert.equal(row.duration_ms,3);
  assert.ok(!lines[0].includes("198.51.100.9"));
});
