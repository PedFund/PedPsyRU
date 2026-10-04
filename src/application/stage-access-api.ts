import type {GroupStageAccess,StageAccess} from "../ports/stage-access.js";
import {studyId,studyObject} from "./study-api.js";
import {ParticipationError} from "../ports/errors.js";
interface Protection{assert(token:string,csrf:string):void}
const record=(r:GroupStageAccess):GroupStageAccess=>({id:r.id,study_id:r.study_id,group_id:r.group_id,stage_id:r.stage_id,
  status:r.status,revision:r.revision,opened_at:r.opened_at});
export function createStageAccessApi(access:StageAccess,protection:Protection){return {
  list:async(token:string,study:string,group:string)=>(await access.list(token,studyId(study),studyId(group))).map(record),
  open:(token:string,study:string,group:string,stage:string,input:unknown,csrf:string)=>{
    protection.assert(token,csrf);const b=studyObject(input,["expected_revision"]);
    if(b.expected_revision!==0&&b.expected_revision!==1)throw new ParticipationError(400,"INVALID_STUDY_INPUT");
    return access.open(token,studyId(study),studyId(group),studyId(stage),{expected_revision:b.expected_revision}).then(record);
  }
};}
