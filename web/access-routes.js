"use strict";

const {AccessError,SESSION_TTL_MS} = require("../storage/access.js");
const COOKIE="pedpsy_demo_session";
function cookieToken(header) {
  if (typeof header!=="string" || header.length>4096) return null;
  const matches=header.split(";").map(part => part.trim()).filter(part => part.startsWith(COOKIE+"="));
  if (matches.length!==1) return null;
  return matches[0].slice(COOKIE.length+1);
}
const cookie = token => COOKIE+"="+token+"; Path=/; HttpOnly; SameSite=Strict; Max-Age="+(SESSION_TTL_MS/1000);
const clearCookie = COOKIE+"=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0";
async function readJson(req) {
  if (req.headers["content-type"]?.split(";")[0].trim().toLowerCase()!=="application/json") throw new AccessError(415,"JSON_REQUIRED");
  const chunks=[];let bytes=0;
  for await (const chunk of req) {bytes+=chunk.length;if(bytes>2048){req.resume();throw new AccessError(413,"BODY_TOO_LARGE");}chunks.push(chunk);}
  try {return JSON.parse(Buffer.concat(chunks).toString("utf8"));} catch {throw new AccessError(400,"INVALID_JSON");}
}
async function handleAccess(req,res,url,json,access) {
  if (!url.pathname.startsWith("/api/auth/") && !url.pathname.startsWith("/api/participant/")) return false;
  try {
    if (!access) throw new AccessError(503,"ACCESS_NOT_CONFIGURED");
    if (url.search) throw new AccessError(400,"INVALID_REQUEST");
    const token=cookieToken(req.headers.cookie);
    const login=url.pathname==="/api/auth/login", logout=url.pathname==="/api/auth/logout";
    if (login && req.method==="POST") {
      // Mandatory same-origin Origin, including login (login CSRF prevention).
      if (req.headers.origin!=="http://"+req.headers.host) throw new AccessError(403,"ORIGIN_REJECTED");
      const result=await access.login(await readJson(req),token);
      if (!result) throw new AccessError(401,"INVALID_LOGIN");
      res.setHeader("Set-Cookie",cookie(result.token));
      json(200,{demo:true,persistence:false,role:"participant",csrf_token:result.csrf_token,expires_at_ms:result.expires_at_ms});
    } else if (logout && req.method==="POST") {
      if (req.headers.origin!=="http://"+req.headers.host) throw new AccessError(403,"ORIGIN_REJECTED");
      access.logout(token,req.headers["x-csrf-token"]);
      res.setHeader("Set-Cookie",clearCookie);json(200,{signed_out:true});
    } else if (url.pathname==="/api/auth/session" && req.method==="GET") {
      json(200,access.session(token));
    } else if (url.pathname==="/api/participant/attempts" && req.method==="GET") {
      json(200,{demo:true,persistence:false,attempts:access.list(token)});
    } else if (/^\/api\/participant\/attempts\/[^/]+$/.test(url.pathname) && req.method==="GET") {
      json(200,{attempt:access.read(token,url.pathname.split("/").at(-1))});
    } else {
      access.requireSession(token);
      // No draft writes, completion, exports or privileged role endpoints in 01д.3.
      if (["/api/auth/login","/api/auth/logout","/api/auth/session","/api/participant/attempts"].includes(url.pathname)
        || /^\/api\/participant\/attempts\/[^/]+$/.test(url.pathname)) throw new AccessError(405,"METHOD_NOT_ALLOWED");
      throw new AccessError(404,"NOT_AVAILABLE");
    }
  } catch (error) {
    if (!(error instanceof AccessError)) throw error;
    if (error.code==="AUTH_REQUIRED") res.setHeader("Set-Cookie",clearCookie);
    if (error.status===429) res.setHeader("Retry-After","900");
    json(error.status,{error:error.code});
  }
  return true;
}
module.exports={handleAccess,cookieToken,COOKIE,readJson};
