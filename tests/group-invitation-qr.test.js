"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),crypto=require("node:crypto"),fs=require("node:fs");
const {matrix}=require("../web/workspace/qr.js"),encoder=require("qrcode-generator");
const origin="https://example.test",link=origin+"/workspace#join="+"A".repeat(43);
test("group QR: pinned deterministic Byte/M matrix, without link text in modules",()=>{
 const m=matrix(link,origin,encoder);assert.equal(m.length,37);assert.ok(m.every(row=>row.length===37&&row.every(v=>typeof v==="boolean")));
 assert.equal(crypto.createHash("sha256").update(JSON.stringify(m)).digest("hex"),"a757619c67c7bae04a866e9f70b754ccccefcad3c55f3d36bc2ee387a168f2c0");
});
test("group QR: rejects external/PII/query/credential/malformed/noncanonical links before encoder",()=>{
 for(const bad of [link.replace(origin,"https://other.test"),link.replace("/workspace","/other"),link.replace("#join=","?email=a%40example.test#join="),link+"&role=superadministrator",link.replace("https://","https://user@"),"javascript:alert(1)",link+" ",link.replace("A","%41"),origin+"/workspace#study="+"A".repeat(43),origin+"/workspace#join="+"A".repeat(600)])assert.throws(()=>matrix(bad,origin,()=>{assert.fail("encoder must not run");}));
 assert.throws(()=>matrix(link,origin+"/",encoder));
});
test("group QR: valid loopback origin supported and encoded exact same fragment link",()=>{
 const value="http://127.0.0.1:4174/workspace#join="+"x".repeat(43);let args,text;
 matrix(value,"http://127.0.0.1:4174",(...a)=>{args=a;const q=encoder(...a),add=q.addData;q.addData=(v,mode)=>{text=[v,mode];add(v,mode);};return q;});
 assert.deepEqual(args,[0,"M"]);assert.deepEqual(text,[value,"Byte"]);
});
test("group QR: encoder is pinned, integrity reviewed, no runtime deps/install scripts",()=>{
 const pkg=JSON.parse(fs.readFileSync(require("node:path").resolve(require.resolve("qrcode-generator"),"../../package.json"),"utf8")),lock=require("../package-lock.json").packages["node_modules/qrcode-generator"];
 assert.equal(pkg.version,"2.0.4");assert.equal(pkg.license,"MIT");assert.deepEqual(pkg.dependencies||{},{});for(const key of ["preinstall","install","postinstall"])assert.equal(pkg.scripts?.[key],undefined);
 assert.equal(lock.integrity,"sha512-mZSiP6RnbHl4xL2Ap5HfkjLnmxfKcPWpWe/c+5XxCuetEenqmNFf1FH/ftXPCtFG5/TDobjsjz6sSNL0Sr8Z9g==");assert.equal(lock.hasInstallScript,undefined);
 const vendor=fs.readFileSync(require.resolve("qrcode-generator"),"utf8");assert.match(vendor,/Copyright \(c\) 2009 Kazuhiko Arase/);assert.doesNotMatch(vendor,/\b(?:fetch|XMLHttpRequest|WebSocket|localStorage|sessionStorage|eval)\s*(?:\(|\.)/);
});
test("group QR: same-origin asset preserves encoder copyright and existing restrictive CSP",async()=>{
 const assets=require("../dist/src/bootstrap/workspace-assets.js").workspaceAssets(),app=require("../dist/src/http/workspace-app.js").createWorkspacePreviewApp(assets);
 try{const r=await app.inject({url:"/workspace/qr.js"});assert.equal(r.statusCode,200);assert.match(r.headers["content-security-policy"],/script-src 'self'/);assert.doesNotMatch(r.headers["content-security-policy"],/unsafe-inline|unsafe-eval|https:/);assert.match(r.body,/Copyright \(c\) 2009 Kazuhiko Arase/);assert.match(r.body,/window.PedPsyQR/);assert.match(assets.html,/src="\/workspace\/qr\.js(?:\?[^"]+)?" defer/);}finally{await app.close();}
});
