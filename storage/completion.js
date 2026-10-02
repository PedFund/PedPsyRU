"use strict";
const {randomUUID}=require("node:crypto");
const {transaction}=require("./database.js");
const {releasePackage,responsesDigest}=require("./releases.js");
const {scoreTki}=require("../core/tki-contract.js");
const {AccessError,csrfFor,equalText}=require("./access.js");
const fail=(status,code)=>{throw new AccessError(status,code);};
function createCompletionStore(db,access,{now=Date.now,score=scoreTki}={}) {
  function audit(actor,id,action,outcome,reason,count=null) {
    db.prepare(`INSERT INTO access_audit_events(id,at_ms,credential_id,study_id,action,outcome,reason,resource_id,record_count)
      VALUES(?,?,?,?,?,?,?,?,?)`).run(randomUUID(),now(),actor.credential_id,actor.study_id,action,outcome,reason,id,count);
  }
  function saved(actor,attempt) {
    const row=db.prepare("SELECT * FROM attempt_results WHERE study_id=? AND attempt_id=? AND release_id=?")
      .get(actor.study_id,attempt.attempt_id,attempt.release_id);
    if(!row)throw new Error("RESULT_STATE_INVALID");
    return {demo:true,persistence:true,attempt_id:attempt.attempt_id,status:"completed",revision:attempt.revision,
      release_id:attempt.release_id,form_id:attempt.form_id,form_version:attempt.form_version,result_id:row.id,
      input_revision:row.input_revision,responses_digest:row.responses_digest,calculated_at:row.calculated_at,result:JSON.parse(row.payload)};
  }
  return {
    read(token,id) {
      access.requireAttempt(token,id);
      const value=transaction(db,()=>{
        const {actor,attempt}=access.requireAttempt(token,id);
        if(attempt.status!=="completed"){audit(actor,id,"result_read","deny","RESULT_NOT_READY");return {error:"RESULT_NOT_READY",status:409};}
        const state=saved(actor,attempt);audit(actor,id,"result_read","allow","OWN_SCOPE",1);return {state};
      });
      if(value.error)fail(value.status,value.error);return value.state;
    },
    complete(token,id,input,csrf) {
      const checked=access.requireAttempt(token,id);
      if(!equalText(csrf,csrfFor(token))){audit(checked.actor,id,"attempt_complete","deny","CSRF_REJECTED");fail(403,"CSRF_REJECTED");}
      const value=transaction(db,()=>{
        const {actor,attempt}=access.requireAttempt(token,id);
        const deny=(status,error)=>{audit(actor,id,"attempt_complete","deny",error);return {status,error};};
        if(!input || typeof input!=="object" || Array.isArray(input) || Object.keys(input).join(",")!=="expected_revision"
          || !Number.isSafeInteger(input.expected_revision) || input.expected_revision<0 || input.expected_revision>=Number.MAX_SAFE_INTEGER)
          return deny(400,"INVALID_COMPLETION");
        // Idempotent retry returns the stored result, never recalculates or rewrites it.
        if(attempt.status==="completed"){
          const state=saved(actor,attempt);audit(actor,id,"attempt_complete","allow","ALREADY_COMPLETED",1);return {state};
        }
        if(attempt.revision!==input.expected_revision)return deny(409,"REVISION_CONFLICT");
        const release=db.prepare("SELECT * FROM instrument_releases WHERE id=?").get(attempt.release_id),pkg=releasePackage();
        if(release.form_id!==pkg.form.id || release.form_version!==pkg.form.version || release.form_digest!==pkg.formDigest
          || release.form_snapshot!==pkg.formSnapshot || release.key_digest!==pkg.keyDigest || release.verification_state!=="key_verified")
          return deny(503,"RELEASE_UNAVAILABLE");
        const items=db.prepare("SELECT item_id FROM release_items WHERE release_id=? ORDER BY ordinal").all(attempt.release_id);
        const responses=db.prepare(`SELECT r.item_id,r.value FROM release_items i JOIN responses r ON r.release_id=i.release_id AND r.item_id=i.item_id
          WHERE r.study_id=? AND r.attempt_id=? ORDER BY i.ordinal`).all(actor.study_id,id);
        if(items.length!==30 || responses.length!==30)return deny(422,"INCOMPLETE_RESPONSES");
        const result=score({contract_version:release.contract_version,method_version_id:release.method_version_id,
          handler_version:release.handler_version,responses});
        if(result.status!=="scored" || result.contract_version!==release.contract_version || result.method_version_id!==release.method_version_id
          || result.handler_version!==release.handler_version || result.calculation?.key_digest!==release.key_digest
          || result.quality?.complete!==true || result.quality?.usable_for_aggregation!==true)
          return deny(422,"SCORING_REJECTED");
        const resultId=randomUUID(),at=new Date(now()).toISOString();
        db.prepare(`INSERT INTO attempt_results(id,study_id,attempt_id,release_id,input_revision,responses_digest,contract_version,handler_version,key_digest,calculated_at,payload)
          VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(resultId,actor.study_id,id,attempt.release_id,attempt.revision,responsesDigest(items,responses),
          release.contract_version,release.handler_version,release.key_digest,at,JSON.stringify(result));
        const updated=db.prepare(`UPDATE attempts SET status='completed',revision=revision+1,completion_result_id=?,completed_at=?,updated_at=?
          WHERE id=? AND study_id=? AND status='draft' AND revision=?`).run(resultId,at,at,id,actor.study_id,input.expected_revision);
        if(updated.changes!==1)fail(409,"REVISION_CONFLICT");
        const state=saved(actor,{...attempt,status:"completed",revision:attempt.revision+1});
        audit(actor,id,"attempt_complete","allow","OWN_SCOPE",1);return {state};
      });
      if(value.error)fail(value.status,value.error);return value.state;
    }
  };
}
module.exports={createCompletionStore};
