"use strict";

// Local demonstration server, not the production platform backend.
const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const form = require("../methods/tki/form.json");
const {scoreTki, CONTRACT_VERSION, METHOD_VERSION_ID, HANDLER_VERSION} = require("../core/tki-contract.js");
const {handleAccess} = require("./access-routes.js");
const {handleAdmin} = require("./admin-routes.js");
const MAX_BODY_BYTES = 16384;
const assets = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/styles.css", ["styles.css", "text/css; charset=utf-8"]],
  ["/app.js", ["app.js", "text/javascript; charset=utf-8"]],
  ["/form-model.js", ["form-model.js", "text/javascript; charset=utf-8"]],
  ["/access", ["access.html", "text/html; charset=utf-8"]],
  ["/access.js", ["access.js", "text/javascript; charset=utf-8"]],
  ["/admin", ["admin.html", "text/html; charset=utf-8"]],
  ["/admin.js", ["admin.js", "text/javascript; charset=utf-8"]]
]);

function createDemoServer({access=null,adminAccess=null}={}) {
  return http.createServer(async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    const json = (status, data) => {
      res.writeHead(status, {"Content-Type": "application/json; charset=utf-8"});
      res.end(JSON.stringify(data));
    };
    const port = req.socket.localPort;
    const hosts = new Set(["localhost:" + port, "127.0.0.1:" + port]);
    if (!hosts.has(req.headers.host)) return json(403, {error: "LOCAL_ONLY"});
    if (req.headers.origin && req.headers.origin !== "http://" + req.headers.host) return json(403, {error: "ORIGIN_REJECTED"});
    if (req.headers["sec-fetch-site"] === "cross-site") return json(403, {error: "ORIGIN_REJECTED"});
    const url = new URL(req.url, "http://127.0.0.1");
    try {
      if (await handleAdmin(req,res,url,json,adminAccess)) return;
      if (await handleAccess(req,res,url,json,access)) return;
      if (url.pathname === "/api/form" && req.method === "GET") {
        return json(200, {
          demo: true, persistence: false,
          versions: {contract_version: CONTRACT_VERSION, method_version_id: METHOD_VERSION_ID, handler_version: HANDLER_VERSION},
          form: {id: form.id, version: form.version, title: form.title, instruction: form.instruction,
            items: form.items.map(item => ({id: item.id, number: item.number,
              options: item.options.map(({value, label, text}) => ({value, label, text}))}))}
        });
      }
      if (url.pathname === "/api/score" && req.method === "POST") {
        if (req.headers["content-type"]?.split(";")[0].trim().toLowerCase() !== "application/json") return json(415, {error: "JSON_REQUIRED"});
        let body = "";
        let bytes = 0;
        for await (const chunk of req) {
          bytes += chunk.length;
          if (bytes > MAX_BODY_BYTES) {
            json(413, {error: "BODY_TOO_LARGE"});
            req.resume();
            return;
          }
          body += chunk.toString("utf8");
        }
        let request;
        try {request = JSON.parse(body);} catch {return json(400, {error: "INVALID_JSON"});}
        const result = scoreTki(request);
        return json(result.status === "scored" ? 200 : 422, {demo: true, persistence: false, result});
      }
      if (req.method === "GET" && assets.has(url.pathname)) {
        const [file, contentType] = assets.get(url.pathname);
        const content = await fs.readFile(path.join(__dirname, file));
        res.writeHead(200, {"Content-Type": contentType});
        return res.end(content);
      }
      if (assets.has(url.pathname) || ["/api/form", "/api/score"].includes(url.pathname)) {
        res.setHeader("Allow", url.pathname === "/api/score" ? "POST" : "GET");
        return json(405, {error: "METHOD_NOT_ALLOWED"});
      }
      return json(404, {error: "NOT_FOUND"});
    } catch {
      // Never log diagnostic answers or echo request bodies in errors.
      if (!res.headersSent) json(500, {error: "DEMO_SERVER_ERROR"});
      else res.end();
    }
  });
}

if (require.main === module) {
  const port = Number(process.env.PEDPSY_DEMO_PORT || 4173);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid PEDPSY_DEMO_PORT");
  const {openDatabase,migrate} = require("../storage/database.js");
  const {createParticipantAccess} = require("../storage/access.js");
  const {createAdminAccess} = require("../storage/admin-access.js");
  const filename=path.join(__dirname,"..",".local","training.sqlite");
  // No automatic database creation/seed/default passwords. Fail closed if not prepared.
  let db,access=null,adminAccess=null;
  if (require("node:fs").existsSync(filename)) {
    db=openDatabase(filename);migrate(db);access=createParticipantAccess(db);
    adminAccess=createAdminAccess(db);
  }
  const server = createDemoServer({access,adminAccess});
  server.on("close",() => {if(db?.isOpen)db.close();});
  server.requestTimeout=10000;server.headersTimeout=10000;
  server.on("error", error => {console.error("Demo server:", error.code); process.exitCode = 1;});
  server.listen(port, "127.0.0.1", () => console.log("ПедПси — демонстрационный стенд: http://127.0.0.1:" + port));
}

module.exports = {createDemoServer, MAX_BODY_BYTES};
