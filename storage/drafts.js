"use strict";
const {randomUUID}=require("node:crypto");
const {transaction}=require("./database.js");
const {AccessError,csrfFor,equalText}=require("./access.js");
const fail=(status,code)=>{throw new AccessError(status,code);};
function createDraftStore(db,access,{now=Date.now}={}) {
  function audit(actor,id,action,outcome,reason,count=null) {
    db.prepare(`INSERT INTO access_audit_events(id,at_ms,credential_id,study_id,action,outcome,reason,resource_id,record_count)
      VALUES(?,?,?,?,?,?,?,?,?)`).run(randomUUID(),now(),actor.credential_id,actor.study_id,action,outcome,reason,id,count);
  }
  function items(release) {
    return db.prepare("SELECT item_id,ordinal,options FROM release_items WHERE release_id=? ORDER BY ordinal").all(release);
  }
  function snapshot(actor,attempt) {
    const release=db.prepare("SELECT form_snapshot FROM instrument_releases WHERE id=?").get(attempt.release_id);
    const form=JSON.parse(release.form_snapshot);
    const responses=db.prepare("SELECT item_id,value FROM responses WHERE study_id=? AND attempt_id=? ORDER BY item_id").all(actor.study_id,attempt.attempt_id);
    return {demo:true,persistence:true,...attempt,responses,versions:{contract_version:attempt.contract_version,
      method_version_id:attempt.method_version_id,handler_version:attempt.handler_version},
      form:{id:attempt.form_id,version:attempt.form_version,title:form.title,instruction:form.instruction,
        items:items(attempt.release_id).map(i=>({id:i.item_id,number:i.ordinal,
          options:JSON.parse(i.options).map(({value,label,text})=>({value,label,text}))}))}};
  }
  function valid(input,allowed) {
    if(!input || typeof input!=="object" || Array.isArray(input)
      || Object.keys(input).sort().join(",")!=="current_item_id,expected_revision,responses"
      || !Number.isSafeInteger(input.expected_revision) || input.expected_revision<0 || input.expected_revision>=Number.MAX_SAFE_INTEGER
      || !allowed.has(input.current_item_id) || !Array.isArray(input.responses) || input.responses.length>allowed.size)return false;
    const seen=new Set();
    for(const r of input.responses) {
      if(!r || typeof r!=="object" || Array.isArray(r) || Object.keys(r).sort().join(",")!=="item_id,value"
        || !allowed.has(r.item_id) || seen.has(r.item_id) || !["A","B"].includes(r.value))return false;
      seen.add(r.item_id);
    }
    return true;
  }
  return {
    read(token,id) {
      // Check once before BEGIN so missing/foreign denial remains in the audit.
      access.requireAttempt(token,id);
      return transaction(db,()=>{
        const {actor,attempt}=access.requireAttempt(token,id),result=snapshot(actor,attempt);
        audit(actor,id,"draft_read","allow","OWN_SCOPE",result.responses.length);return result;
      });
    },
    save(token,id,input,csrf) {
      const checked=access.requireAttempt(token,id);
      if(!equalText(csrf,csrfFor(token))){audit(checked.actor,id,"draft_save","deny","CSRF_REJECTED");fail(403,"CSRF_REJECTED");}
      const result=transaction(db,()=>{
        // Recheck under the same write lock as the snapshot replacement.
        const {actor,attempt}=access.requireAttempt(token,id);
        const deny=(status,error)=>{audit(actor,id,"draft_save","deny",error);return {status,error};};
        if(attempt.status!=="draft")return deny(409,"ATTEMPT_COMPLETED");
        const allowed=new Set(items(attempt.release_id).map(i=>i.item_id));
        if(!valid(input,allowed))return deny(400,"INVALID_DRAFT");
        if(input.expected_revision!==attempt.revision)return deny(409,"REVISION_CONFLICT");
        db.prepare("DELETE FROM responses WHERE study_id=? AND attempt_id=?").run(actor.study_id,id);
        const insert=db.prepare("INSERT INTO responses(study_id,attempt_id,release_id,item_id,value) VALUES(?,?,?,?,?)");
        for(const r of input.responses)insert.run(actor.study_id,id,attempt.release_id,r.item_id,r.value);
        const updated=db.prepare(`UPDATE attempts SET current_item_id=?,revision=revision+1,
          updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND study_id=? AND status='draft' AND revision=?`)
          .run(input.current_item_id,id,actor.study_id,input.expected_revision);
        if(updated.changes!==1)fail(409,"REVISION_CONFLICT");
        const state=snapshot(actor,{...attempt,revision:attempt.revision+1,current_item_id:input.current_item_id});
        audit(actor,id,"draft_save","allow","OWN_SCOPE",state.responses.length);return {state};
      });
      if(result.error)fail(result.status,result.error);
      return result.state;
    }
  };
}
module.exports={createDraftStore};
