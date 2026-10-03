"use strict";

const {scrypt,randomBytes,randomUUID,timingSafeEqual,createHmac} = require("node:crypto");
const {promisify} = require("node:util");
const {transaction,sha256} = require("./database.js");
const derive = promisify(scrypt);
const SCHEME = "scrypt-N131072-r8-p1-dk64";
const SCRYPT = {N:131072,r:8,p:1,maxmem:160*1024*1024};
const SESSION_TTL_MS = 30*60*1000;
const IDLE_TTL_MS = 10*60*1000;
const LOGIN_WINDOW_MS = 15*60*1000;
const GLOBAL_WINDOW_MS = 5*60*1000;
const LOGIN_LIMIT = 5;
const GLOBAL_LIMIT = 30;
const validLogin = value => typeof value === "string" && /^[A-Z0-9-]{3,80}$/.test(value);
const validPassword = value => typeof value === "string" && value.length>=12 && Buffer.byteLength(value,"utf8")<=256;
const validToken = token => typeof token === "string" && /^[A-Za-z0-9_-]{43}$/.test(token);
const csrfFor = token => createHmac("sha256",token).update("pedpsy-demo-csrf-v1").digest("base64url");
const equalText = (a,b) => {
  if(typeof a!=="string" || typeof b!=="string")return false;
  const first=Buffer.from(a),second=Buffer.from(b);
  return first.length===second.length && timingSafeEqual(first,second);
};
class AccessError extends Error {
  constructor(status,code) {super(code);this.status=status;this.code=code;}
}

async function passwordRecord(password) {
  if (!validPassword(password)) throw new AccessError(400,"INVALID_PASSWORD");
  const salt=randomBytes(16).toString("hex");
  const hash=await derive(password,Buffer.from(salt,"hex"),64,SCRYPT);
  return {scheme:SCHEME,salt,password_hash:hash.toString("hex")};
}

function audit(db,at,action,outcome,reason,actor) {
  db.prepare("INSERT INTO access_audit_events(id,at_ms,credential_id,study_id,action,outcome,reason) VALUES(?,?,?,?,?,?,?)")
    .run(randomUUID(),at,actor?.credential_id ?? null,actor?.study_id ?? null,action,outcome,reason);
}

function createParticipantAccess(db,{now=Date.now}={}) {
  const dummySalt=randomBytes(16);
  let deriving=false;
  const fail=(status,code) => {throw new AccessError(status,code);};
  const credential = id => db.prepare(`SELECT c.*,p.status AS participant_status,s.status AS study_status,s.dataset_kind
    FROM participant_credentials c JOIN participants p ON p.id=c.participant_id AND p.study_id=c.study_id
    JOIN studies s ON s.id=c.study_id WHERE c.id=?`).get(id);
  const usable = row => row?.status==="active" && row.participant_status==="active" && row.study_status==="active" && row.dataset_kind==="demo";

  function takeBucket(bucket,at,window,limit) {
    const hash=sha256(bucket);
    const row=db.prepare("SELECT * FROM login_throttles WHERE bucket_hash=?").get(hash);
    const expired=!row || at-row.window_start_ms>=window;
    if (!expired && row.count>=limit) fail(429,"LOGIN_THROTTLED");
    db.prepare(`INSERT INTO login_throttles(bucket_hash,window_start_ms,count) VALUES(?,?,1)
      ON CONFLICT(bucket_hash) DO UPDATE SET window_start_ms=excluded.window_start_ms,
      count=CASE WHEN ? THEN 1 ELSE login_throttles.count+1 END`).run(hash,expired?at:row.window_start_ms,expired?1:0);
  }
  function resolve(token,{touch=true}={}) {
    const at=now();
    if (!validToken(token)) fail(401,"AUTH_REQUIRED");
    const hash=sha256(token);
    const session=db.prepare("SELECT * FROM participant_sessions WHERE token_hash=?").get(hash);
    const row=session && credential(session.credential_id);
    if (!session || session.revoked_at_ms!==null || at>=session.expires_at_ms || at-session.last_seen_at_ms>=IDLE_TTL_MS
      || at<session.last_seen_at_ms || !usable(row) || row.version!==session.credential_version
      || row.study_id!==session.study_id || row.participant_id!==session.participant_id) fail(401,"AUTH_REQUIRED");
    if (touch) db.prepare("UPDATE participant_sessions SET last_seen_at_ms=? WHERE token_hash=?").run(at,hash);
    return {credential_id:row.id,study_id:row.study_id,participant_id:row.participant_id,token_hash:hash,expires_at_ms:session.expires_at_ms};
  }
  function ownAttempts(actor,id) {
    // No client study, participant or role influences this parameterized scope.
    return db.prepare(`SELECT a.id AS attempt_id,a.status,a.revision,a.current_item_id,a.release_id,
      g.name AS group_name,s.code AS stage_code,r.form_id,r.form_version,r.method_version_id,r.handler_version,r.contract_version
      FROM attempts a JOIN stage_enrollments e ON e.id=a.enrollment_id AND e.study_id=a.study_id
      JOIN assignments x ON x.id=a.assignment_id AND x.study_id=a.study_id
      JOIN research_groups g ON g.id=a.group_id AND g.study_id=a.study_id
      JOIN research_stages s ON s.id=a.stage_id AND s.study_id=a.study_id
      JOIN instrument_releases r ON r.id=a.release_id
      WHERE a.study_id=? AND e.participant_id=? AND e.status='active' AND x.status='active'
        AND g.status='active' AND s.status='active' ${id ? "AND a.id=?" : ""} ORDER BY s.ordinal,a.id`)
      .all(...(id?[actor.study_id,actor.participant_id,id]:[actor.study_id,actor.participant_id]));
  }
  return {
    async provision({study_id,participant_id,login_id,password}) {
      if (!validLogin(login_id)) fail(400,"INVALID_LOGIN_ID");
      if (deriving) fail(429,"LOGIN_THROTTLED");
      deriving=true;
      try {
        const record=await passwordRecord(password);
        return transaction(db,() => {
          const participant=db.prepare(`SELECT p.id FROM participants p JOIN studies s ON s.id=p.study_id
            WHERE p.id=? AND p.study_id=? AND p.status='active' AND s.status='active' AND s.dataset_kind='demo'`).get(participant_id,study_id);
          if (!participant) fail(404,"NOT_AVAILABLE");
          const id=randomUUID();
          db.prepare(`INSERT INTO participant_credentials(id,study_id,participant_id,login_id,scheme,salt,password_hash)
            VALUES(?,?,?,?,?,?,?)`).run(id,study_id,participant_id,login_id,record.scheme,record.salt,record.password_hash);
          audit(db,now(),"credential_issue","allow","LOCAL_OPERATOR",{credential_id:id,study_id});
          return id;
        });
      } finally {deriving=false;}
    },
    async resetPassword(login_id,password) {
      if (deriving) fail(429,"LOGIN_THROTTLED");
      deriving=true;
      try {
        const record=await passwordRecord(password);
        return transaction(db,() => {
          const row=db.prepare("SELECT id,study_id FROM participant_credentials WHERE login_id=?").get(login_id);
          if (!row) fail(404,"NOT_AVAILABLE");
          const at=now();
          db.prepare("UPDATE participant_credentials SET scheme=?,salt=?,password_hash=?,version=version+1,status='active',updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?")
            .run(record.scheme,record.salt,record.password_hash,row.id);
          db.prepare("UPDATE participant_sessions SET revoked_at_ms=? WHERE credential_id=? AND revoked_at_ms IS NULL").run(at,row.id);
          db.prepare("DELETE FROM login_throttles WHERE bucket_hash=?").run(sha256("login:"+login_id));
          audit(db,at,"credential_reset","allow","LOCAL_OPERATOR",{credential_id:row.id,study_id:row.study_id});
        });
      } finally {deriving=false;}
    },
    revoke(login_id) {
      return transaction(db,() => {
        const row=db.prepare("SELECT id,study_id FROM participant_credentials WHERE login_id=?").get(login_id);
        if (!row) fail(404,"NOT_AVAILABLE");
        const at=now();
        db.prepare("UPDATE participant_credentials SET status='revoked',version=version+1 WHERE id=?").run(row.id);
        db.prepare("UPDATE participant_sessions SET revoked_at_ms=? WHERE credential_id=? AND revoked_at_ms IS NULL").run(at,row.id);
        audit(db,at,"credential_revoke","allow","LOCAL_OPERATOR",{credential_id:row.id,study_id:row.study_id});
      });
    },
    async login(input,oldToken) {
      if (!input || typeof input!=="object" || Array.isArray(input) || Object.keys(input).sort().join(",")!=="login_id,password"
        || !validLogin(input.login_id) || !validPassword(input.password)) fail(400,"INVALID_LOGIN");
      const at=now();
      // Persistent global limiter runs first: random login IDs cannot grow the table without bound per window.
      db.prepare("DELETE FROM login_throttles WHERE window_start_ms<?").run(at-LOGIN_WINDOW_MS);
      takeBucket("global-loopback",at,GLOBAL_WINDOW_MS,GLOBAL_LIMIT);
      takeBucket("login:"+input.login_id,at,LOGIN_WINDOW_MS,LOGIN_LIMIT);
      if (deriving) fail(429,"LOGIN_THROTTLED");
      deriving=true;
      try {
        const initial=db.prepare("SELECT * FROM participant_credentials WHERE login_id=?").get(input.login_id);
        const validRecord=initial?.scheme===SCHEME && /^[0-9a-f]{32}$/.test(initial.salt) && /^[0-9a-f]{128}$/.test(initial.password_hash);
        const computed=await derive(input.password,validRecord?Buffer.from(initial.salt,"hex"):dummySalt,64,SCRYPT);
        const match=timingSafeEqual(computed,validRecord?Buffer.from(initial.password_hash,"hex"):Buffer.alloc(64));
        return transaction(db,() => {
          const current=initial && credential(initial.id);
          // Recheck after async hash: revoke/reset/exclusion while hashing cannot mint a session.
          if (!match || !usable(current) || current.version!==initial.version || current.password_hash!==initial.password_hash) {
            audit(db,now(),"login","deny","INVALID_LOGIN");
            return null;
          }
          const issued=now(),token=randomBytes(32).toString("base64url");
          if (validToken(oldToken)) db.prepare("UPDATE participant_sessions SET revoked_at_ms=? WHERE token_hash=? AND revoked_at_ms IS NULL").run(issued,sha256(oldToken));
          db.prepare(`INSERT INTO participant_sessions(token_hash,credential_id,study_id,participant_id,credential_version,
            created_at_ms,last_seen_at_ms,expires_at_ms) VALUES(?,?,?,?,?,?,?,?)`)
            .run(sha256(token),current.id,current.study_id,current.participant_id,current.version,issued,issued,issued+SESSION_TTL_MS);
          audit(db,issued,"login","allow","PARTICIPANT",{credential_id:current.id,study_id:current.study_id});
          return {token,csrf_token:csrfFor(token),expires_at_ms:issued+SESSION_TTL_MS};
        });
      } finally {deriving=false;}
    },
    session(token) {
      const actor=resolve(token);
      const code=db.prepare("SELECT display_code FROM participants WHERE id=? AND study_id=?").get(actor.participant_id,actor.study_id).display_code;
      return {role:"participant",display_code:code,expires_at_ms:actor.expires_at_ms,csrf_token:csrfFor(token),demo:true,persistence:false};
    },
    logout(token,csrf) {
      const actor=resolve(token,{touch:false});
      if (!equalText(csrf,csrfFor(token))) fail(403,"CSRF_REJECTED");
      return transaction(db,() => {
        db.prepare("UPDATE participant_sessions SET revoked_at_ms=? WHERE token_hash=?").run(now(),actor.token_hash);
        audit(db,now(),"logout","allow","PARTICIPANT",actor);
      });
    },
    list(token) {
      const actor=resolve(token);
      audit(db,now(),"attempt_list","allow","OWN_SCOPE",actor);
      return ownAttempts(actor);
    },
    read(token,id) {
      const actor=resolve(token);
      const attempt=ownAttempts(actor,id)[0];
      if (!attempt) {audit(db,now(),"attempt_read","deny","NOT_AVAILABLE",actor);fail(404,"NOT_AVAILABLE");}
      const responses=db.prepare("SELECT item_id,value FROM responses WHERE study_id=? AND attempt_id=? ORDER BY item_id").all(actor.study_id,id);
      audit(db,now(),"attempt_read","allow","OWN_SCOPE",actor);
      // No individual result, key, digest, credentials or source_text. Result publication is separate 01е.
      return {...attempt,responses,demo:true,persistence:false};
    },
    requireAttempt(token,id) {
      const actor=resolve(token);
      const attempt=typeof id==='string' && id.length>0 && ownAttempts(actor,id)[0];
      if(!attempt){audit(db,now(),"attempt_access","deny","NOT_AVAILABLE",actor);fail(404,"NOT_AVAILABLE");}
      return {actor,attempt};
    },
    requireSession: resolve
  };
}

// Shared security primitives only; participant scope and scoring are unchanged.
module.exports = {createParticipantAccess,passwordRecord,AccessError,SCHEME,SESSION_TTL_MS,IDLE_TTL_MS,LOGIN_WINDOW_MS,LOGIN_LIMIT,
  derive,SCRYPT,validLogin,validPassword,validToken,csrfFor,equalText,GLOBAL_WINDOW_MS,GLOBAL_LIMIT};
