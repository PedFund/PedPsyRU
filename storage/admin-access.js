"use strict";

const {randomBytes,randomUUID,timingSafeEqual}=require("node:crypto");
const {transaction,sha256}=require("./database.js");
const {passwordRecord,AccessError,SCHEME,derive,SCRYPT,validLogin,validPassword,validToken,csrfFor,equalText,
  SESSION_TTL_MS,IDLE_TTL_MS,LOGIN_WINDOW_MS,LOGIN_LIMIT,GLOBAL_WINDOW_MS,GLOBAL_LIMIT}=require("./access.js");
const {POLICY,IMPLEMENTED,permits}=require("./roles.js");
const EXPORT_LIMIT=500, EXPORT_BYTES=4*1024*1024;
const fail=(status,code)=>{throw new AccessError(status,code);};

function createAdminAccess(db,{now=Date.now}={}) {
  const dummySalt=randomBytes(16);let deriving=false;
  const credential=id=>db.prepare(`SELECT c.*,u.status AS user_status FROM staff_credentials c
    JOIN users u ON u.id=c.user_id WHERE c.id=?`).get(id);
  const usable=row=>row?.status==="active" && row.user_status==="active" && Object.hasOwn(POLICY,row.role);
  function audit(action,outcome,reason,actor,resource=null,count=null) {
    db.prepare(`INSERT INTO access_audit_events(id,at_ms,credential_id,action,outcome,reason,actor_role,resource_id,record_count)
      VALUES(?,?,?,?,?,?,?,?,?)`).run(randomUUID(),now(),actor?.credential_id??null,action,outcome,reason,actor?.role??null,resource,count);
  }
  function bucket(name,at,window,limit) {
    const hash=sha256(name),row=db.prepare("SELECT * FROM login_throttles WHERE bucket_hash=?").get(hash);
    const expired=!row || at-row.window_start_ms>=window;
    if(!expired && (at<row.window_start_ms || row.count>=limit))fail(429,"LOGIN_THROTTLED");
    db.prepare(`INSERT INTO login_throttles(bucket_hash,window_start_ms,count) VALUES(?,?,1)
      ON CONFLICT(bucket_hash) DO UPDATE SET window_start_ms=excluded.window_start_ms,
      count=CASE WHEN ? THEN 1 ELSE login_throttles.count+1 END`).run(hash,expired?at:row.window_start_ms,expired?1:0);
  }
  function resolve(token,{touch=true}={}) {
    const at=now(),hash=validToken(token)?sha256(token):null;
    const s=hash && db.prepare("SELECT * FROM staff_sessions WHERE token_hash=?").get(hash);
    const row=s && credential(s.credential_id);
    if(!s || s.revoked_at_ms!==null || at>=s.expires_at_ms || at-s.last_seen_at_ms>=IDLE_TTL_MS
      || at<s.last_seen_at_ms || !usable(row) || row.version!==s.credential_version || row.user_id!==s.user_id || row.role!==s.role) {
      audit("staff_access","deny","AUTH_REQUIRED");fail(401,"AUTH_REQUIRED");
    }
    if(touch)db.prepare("UPDATE staff_sessions SET last_seen_at_ms=? WHERE token_hash=?").run(at,hash);
    return {credential_id:row.id,user_id:row.user_id,role:row.role,token_hash:hash,expires_at_ms:s.expires_at_ms};
  }
  function authorize(token,permission) {
    const actor=resolve(token);
    if(!permits(actor.role,permission)){audit("staff_access","deny","FORBIDDEN",actor);fail(403,"FORBIDDEN");}
    return actor;
  }
  const select=`SELECT a.id AS attempt_id,a.study_id,s.title AS study_title,s.status AS study_status,
    a.status,a.revision,a.current_item_id,a.release_id,p.display_code,p.status AS participant_status,
    g.name AS group_name,g.status AS group_status,t.code AS stage_code,t.status AS stage_status,
    e.status AS enrollment_status,x.status AS assignment_status,
    r.method_id,r.form_id,r.form_version,r.method_version_id,r.handler_version,r.contract_version,
    (SELECT count(*) FROM responses WHERE attempt_id=a.id) AS answer_count
    FROM attempts a JOIN studies s ON s.id=a.study_id
    JOIN stage_enrollments e ON e.id=a.enrollment_id AND e.study_id=a.study_id
    JOIN participants p ON p.id=e.participant_id AND p.study_id=a.study_id
    JOIN research_groups g ON g.id=a.group_id AND g.study_id=a.study_id
    JOIN research_stages t ON t.id=a.stage_id AND t.study_id=a.study_id
    JOIN assignments x ON x.id=a.assignment_id AND x.study_id=a.study_id
    JOIN instrument_releases r ON r.id=a.release_id WHERE s.dataset_kind='demo'`;
  const order=" ORDER BY a.study_id,p.display_code,t.ordinal,a.id";
  function protocol(row) {
    const items=db.prepare(`SELECT i.item_id,i.ordinal,i.options,v.value FROM release_items i
      LEFT JOIN responses v ON v.release_id=i.release_id AND v.item_id=i.item_id AND v.attempt_id=?
      WHERE i.release_id=? ORDER BY i.ordinal`).all(row.attempt_id,row.release_id);
    return {...row,items:items.map(i=>({item_id:i.item_id,number:i.ordinal,
      options:JSON.parse(i.options).map(({value,label,text})=>({value,label,text})),value:i.value})),
      missing_item_ids:items.filter(i=>i.value===null).map(i=>i.item_id),demo:true};
  }
  function one(id,actor) {
    const row=db.prepare(select+" AND a.id=?").get(id);
    if(!row){audit("staff_attempt_read","deny","NOT_AVAILABLE",actor);fail(404,"NOT_AVAILABLE");}
    return protocol(row);
  }
  function exportData(token,id) {
    const actor=authorize(token,"responses.export_all");
    // Synchronous snapshot + mandatory audit before any response body is sent.
    return transaction(db,()=>{
      let protocols;
      if(id) {
        const row=db.prepare(select+" AND a.id=?").get(id);
        if(!row){audit("staff_answers_export","deny","NOT_AVAILABLE",actor);return {error:"NOT_AVAILABLE",status:404};}
        protocols=[protocol(row)];
      }
      else {
        const rows=db.prepare(select+order+" LIMIT ?").all(EXPORT_LIMIT+1);
        if(rows.length>EXPORT_LIMIT){audit("staff_answers_export","deny","EXPORT_LIMIT",actor);return {error:"EXPORT_LIMIT"};}
        protocols=rows.map(protocol);
      }
      const payload={export_version:"pedpsy-primary-answers-1.0",demo:true,generated_at:new Date(now()).toISOString(),
        scope:id?"single_attempt":"all_demo_studies",protocol_count:protocols.length,protocols};
      const body=JSON.stringify(payload,null,2);
      if(Buffer.byteLength(body)>EXPORT_BYTES){audit("staff_answers_export","deny","EXPORT_LIMIT",actor);return {error:"EXPORT_LIMIT"};}
      audit("staff_answers_export","allow",id?"SINGLE_ATTEMPT":"ALL_STUDIES",actor,id??null,protocols.length);
      return {body};
    });
  }
  return {
    async provision({role,login_id,password}) {
      if(!Object.hasOwn(POLICY,role) || !validLogin(login_id))fail(400,"INVALID_STAFF");
      if(deriving)fail(429,"LOGIN_THROTTLED");deriving=true;
      try {
        const record=await passwordRecord(password);
        return transaction(db,()=>{
          const user_id=randomUUID(),id=randomUUID();
          db.prepare("INSERT INTO users(id) VALUES(?)").run(user_id);
          db.prepare(`INSERT INTO staff_credentials(id,user_id,login_id,role,scheme,salt,password_hash) VALUES(?,?,?,?,?,?,?)`)
            .run(id,user_id,login_id,role,record.scheme,record.salt,record.password_hash);
          audit("staff_credential_issue","allow","LOCAL_OPERATOR",{credential_id:id,role});return id;
        });
      } finally {deriving=false;}
    },
    async resetPassword(login_id,password) {
      if(deriving)fail(429,"LOGIN_THROTTLED");deriving=true;
      try {
        const record=await passwordRecord(password);
        return transaction(db,()=>{
          const row=db.prepare("SELECT * FROM staff_credentials WHERE login_id=?").get(login_id);
          if(!row)fail(404,"NOT_AVAILABLE");
          db.prepare("UPDATE staff_credentials SET scheme=?,salt=?,password_hash=?,version=version+1,status='active' WHERE id=?")
            .run(record.scheme,record.salt,record.password_hash,row.id);
          db.prepare("UPDATE staff_sessions SET revoked_at_ms=? WHERE credential_id=? AND revoked_at_ms IS NULL").run(now(),row.id);
          db.prepare("DELETE FROM login_throttles WHERE bucket_hash=?").run(sha256("staff-login:"+login_id));
          audit("staff_credential_reset","allow","LOCAL_OPERATOR",{credential_id:row.id,role:row.role});
        });
      } finally {deriving=false;}
    },
    revoke(login_id) {
      transaction(db,()=>{
        const row=db.prepare("SELECT * FROM staff_credentials WHERE login_id=?").get(login_id);
        if(!row)fail(404,"NOT_AVAILABLE");
        db.prepare("UPDATE staff_credentials SET status='revoked',version=version+1 WHERE id=?").run(row.id);
        db.prepare("UPDATE staff_sessions SET revoked_at_ms=? WHERE credential_id=? AND revoked_at_ms IS NULL").run(now(),row.id);
        audit("staff_credential_revoke","allow","LOCAL_OPERATOR",{credential_id:row.id,role:row.role});
      });
    },
    async login(input,oldToken) {
      if(!input || typeof input!=="object" || Array.isArray(input) || Object.keys(input).sort().join(",")!=="login_id,password"
        || !validLogin(input.login_id) || !validPassword(input.password))fail(400,"INVALID_LOGIN");
      const at=now();db.prepare("DELETE FROM login_throttles WHERE window_start_ms<?").run(at-LOGIN_WINDOW_MS);
      bucket("global-loopback",at,GLOBAL_WINDOW_MS,GLOBAL_LIMIT);bucket("staff-login:"+input.login_id,at,LOGIN_WINDOW_MS,LOGIN_LIMIT);
      if(deriving)fail(429,"LOGIN_THROTTLED");deriving=true;
      try {
        const initial=db.prepare("SELECT * FROM staff_credentials WHERE login_id=?").get(input.login_id);
        const validRecord=initial?.scheme===SCHEME && /^[0-9a-f]{32}$/.test(initial.salt) && /^[0-9a-f]{128}$/.test(initial.password_hash);
        const computed=await derive(input.password,validRecord?Buffer.from(initial.salt,"hex"):dummySalt,64,SCRYPT);
        const match=timingSafeEqual(computed,validRecord?Buffer.from(initial.password_hash,"hex"):Buffer.alloc(64));
        return transaction(db,()=>{
          const row=initial && credential(initial.id);
          if(!match || !usable(row) || row.version!==initial.version || row.password_hash!==initial.password_hash){
            audit("staff_login","deny","INVALID_LOGIN");return null;
          }
          const issued=now(),token=randomBytes(32).toString("base64url");
          if(validToken(oldToken))db.prepare("UPDATE staff_sessions SET revoked_at_ms=? WHERE token_hash=? AND revoked_at_ms IS NULL").run(issued,sha256(oldToken));
          db.prepare(`INSERT INTO staff_sessions(token_hash,credential_id,user_id,role,credential_version,created_at_ms,last_seen_at_ms,expires_at_ms)
            VALUES(?,?,?,?,?,?,?,?)`).run(sha256(token),row.id,row.user_id,row.role,row.version,issued,issued,issued+SESSION_TTL_MS);
          audit("staff_login","allow","STAFF",{credential_id:row.id,role:row.role});
          return {token,role:row.role,csrf_token:csrfFor(token),expires_at_ms:issued+SESSION_TTL_MS};
        });
      } finally {deriving=false;}
    },
    session(token) {
      const actor=resolve(token);
      return {role:actor.role,scope:"all_studies",demo:true,csrf_token:csrfFor(token),expires_at_ms:actor.expires_at_ms,
        implemented_permissions:[...IMPLEMENTED],planned_permissions:POLICY[actor.role].filter(p=>!IMPLEMENTED.includes(p))};
    },
    logout(token,csrf) {
      const actor=resolve(token,{touch:false});
      if(!equalText(csrf,csrfFor(token)))fail(403,"CSRF_REJECTED");
      transaction(db,()=>{
        db.prepare("UPDATE staff_sessions SET revoked_at_ms=? WHERE token_hash=?").run(now(),actor.token_hash);
        audit("staff_logout","allow","STAFF",actor);
      });
    },
    studies(token) {
      const actor=authorize(token,"studies.read_all");
      const rows=db.prepare(`SELECT s.id,s.title,s.status,(SELECT count(*) FROM participants WHERE study_id=s.id) AS participant_count,
        (SELECT count(*) FROM attempts WHERE study_id=s.id) AS attempt_count FROM studies s WHERE dataset_kind='demo' ORDER BY s.id`).all();
      audit("staff_study_list","allow","ALL_STUDIES",actor,null,rows.length);return rows;
    },
    list(token,{offset=0,limit=50}={}) {
      const actor=authorize(token,"responses.read_all");
      if(!Number.isSafeInteger(offset) || offset<0 || !Number.isSafeInteger(limit) || limit<1 || limit>100)fail(400,"INVALID_PAGE");
      const rows=db.prepare(select+order+" LIMIT ? OFFSET ?").all(limit,offset);
      const total=db.prepare("SELECT count(*) AS count FROM attempts a JOIN studies s ON s.id=a.study_id WHERE s.dataset_kind='demo'").get().count;
      audit("staff_attempt_list","allow","ALL_STUDIES",actor,null,rows.length);return {attempts:rows,total,offset,limit};
    },
    read(token,id) {
      const actor=authorize(token,"responses.read_all"),result=one(id,actor);
      audit("staff_attempt_read","allow","ALL_STUDIES",actor,id,1);return result;
    },
    export(token,id) {const result=exportData(token,id);if(result.error)fail(result.status??413,result.error);return result.body;},
    requireSession:resolve
  };
}
module.exports={createAdminAccess,EXPORT_LIMIT,EXPORT_BYTES};
