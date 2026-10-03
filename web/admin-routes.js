"use strict";
const {AccessError,SESSION_TTL_MS}=require("../storage/access.js");
const {readJson}=require("./access-routes.js");
const COOKIE="pedpsy_staff_session";
const cookie=token=>COOKIE+"="+token+"; Path=/; HttpOnly; SameSite=Strict; Max-Age="+(SESSION_TTL_MS/1000);
const clearCookie=COOKIE+"=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0";
function cookieToken(header) {
  if(typeof header!=="string" || header.length>4096)return null;
  const matches=header.split(";").map(p=>p.trim()).filter(p=>p.startsWith(COOKIE+"="));
  return matches.length===1?matches[0].slice(COOKIE.length+1):null;
}
async function handleAdmin(req,res,url,json,service) {
  if(!url.pathname.startsWith("/api/admin/"))return false;
  try {
    if(!service)throw new AccessError(503,"ACCESS_NOT_CONFIGURED");
    const token=cookieToken(req.headers.cookie),p=url.pathname;
    const paged=p==="/api/admin/attempts";
    if(url.search && !paged)throw new AccessError(400,"INVALID_REQUEST");
    if(p==="/api/admin/auth/login" && req.method==="POST") {
      if(req.headers.origin!=="http://"+req.headers.host)throw new AccessError(403,"ORIGIN_REJECTED");
      const result=await service.login(await readJson(req),token);
      if(!result)throw new AccessError(401,"INVALID_LOGIN");
      res.setHeader("Set-Cookie",cookie(result.token));
      json(200,{role:result.role,csrf_token:result.csrf_token,expires_at_ms:result.expires_at_ms,demo:true});
    } else if(p==="/api/admin/auth/logout" && req.method==="POST") {
      if(req.headers.origin!=="http://"+req.headers.host)throw new AccessError(403,"ORIGIN_REJECTED");
      service.logout(token,req.headers["x-csrf-token"]);res.setHeader("Set-Cookie",clearCookie);json(200,{signed_out:true});
    } else if(p==="/api/admin/auth/session" && req.method==="GET")json(200,service.session(token));
    else if(p==="/api/admin/studies" && req.method==="GET")json(200,{demo:true,scope:"all_studies",studies:service.studies(token)});
    else if(paged && req.method==="GET") {
      service.requireSession(token);
      const page={};
      for(const [key,value] of url.searchParams) {
        if(!["offset","limit"].includes(key) || Object.hasOwn(page,key) || !/^\d{1,10}$/.test(value))throw new AccessError(400,"INVALID_PAGE");
        page[key]=Number(value);
      }
      json(200,{demo:true,scope:"all_studies",...service.list(token,page)});
    } else if(req.method==="GET" && (p==="/api/admin/answers.json" || /^\/api\/admin\/attempts\/[^/]+\/answers\.json$/.test(p))) {
      const id=p==="/api/admin/answers.json"?undefined:p.split("/")[4];
      const body=service.export(token,id);
      res.writeHead(200,{"Content-Type":"application/json; charset=utf-8",
        "Content-Disposition":'attachment; filename="'+(id?"pedpsy-attempt-answers.json":"pedpsy-all-answers.json")+'"'});
      res.end(body);
    } else if(req.method==="GET" && /^\/api\/admin\/attempts\/[^/]+$/.test(p))json(200,{attempt:service.read(token,p.split("/")[4])});
    else {
      service.requireSession(token);
      const known=["/api/admin/auth/login","/api/admin/auth/logout","/api/admin/auth/session","/api/admin/studies","/api/admin/attempts","/api/admin/answers.json"].includes(p)
        || /^\/api\/admin\/attempts\/[^/]+(?:\/answers\.json)?$/.test(p);
      throw new AccessError(known?405:404,known?"METHOD_NOT_ALLOWED":"NOT_AVAILABLE");
    }
  }catch(error) {
    if(!(error instanceof AccessError))throw error;
    if(error.code==="AUTH_REQUIRED")res.setHeader("Set-Cookie",clearCookie);
    if(error.status===429)res.setHeader("Retry-After","900");
    json(error.status,{error:error.code});
  }
  return true;
}
module.exports={handleAdmin,COOKIE,cookieToken};
