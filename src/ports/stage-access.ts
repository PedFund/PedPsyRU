export interface GroupStageAccess {
  readonly id:string|null;readonly study_id:string;readonly group_id:string;readonly stage_id:string;
  readonly status:"not_open"|"open";readonly revision:0|1;readonly opened_at:number|null;
}
export interface StageAccess {
  list(token:string,studyId:string,groupId:string):Promise<GroupStageAccess[]>;
  open(token:string,studyId:string,groupId:string,stageId:string,input:{expected_revision:0|1}):Promise<GroupStageAccess>;
}
