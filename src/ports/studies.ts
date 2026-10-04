export interface StudyDesign {
  id:string; title:string; status:"draft"|"active"|"closed"; version:number; dataset_kind:"demo";
  groups:GroupDesign[]; stages:StageDesign[]; assignments:AssignmentDesign[];
  catalog:ConstructorRelease[];
}
export interface ConstructorRelease {id:string;method_id:string;form_version:string;method_version_id:string;handler_version:string;verification_state:"key_verified";publication_state:"draft"}
export interface StudySummary {id:string;title:string;status:"draft"|"active"|"closed";version:number}
export interface GroupDesign {id:string;name:string;kind:"control"|"experimental"|"other";status:"active"|"closed"}
export interface StageDesign {id:string;code:string;ordinal:number;status:"active"|"closed";based_on_stage_id:string|null}
export interface AssignmentDesign {id:string;group_id:string;stage_id:string;release_id:string;status:"active"|"closed"}
export interface StudyConstructor {
  listStaff(token:string):Promise<StudySummary[]>;
  create(token:string,title:string):Promise<StudyDesign>;
  createFor(token:string,ownerCredentialId:string,title:string):Promise<StudyDesign>;
  read(token:string,id:string):Promise<StudyDesign>;
  group(token:string,id:string,groupId:string|undefined,input:{name:string;kind:GroupDesign["kind"];expected_version:number}):Promise<StudyDesign>;
  stage(token:string,id:string,stageId:string|undefined,input:{code:string;ordinal:number;expected_version:number}):Promise<StudyDesign>;
  assign(token:string,id:string,input:{group_id:string;stage_id:string;release_ids:string[];expected_version:number}):Promise<StudyDesign>;
  copy(token:string,id:string,input:{source_stage_id:string;code:string;ordinal:number;expected_version:number}):Promise<StudyDesign>;
  lifecycle(token:string,id:string,input:{status:"active"|"closed";expected_version:number}):Promise<StudyDesign>;
  title(token:string,id:string,input:{title:string;expected_version:number}):Promise<StudyDesign>;
}
