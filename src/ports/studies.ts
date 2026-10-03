export interface StudyDesign {
  id:string; title:string; status:"draft"|"active"|"closed"; version:number; dataset_kind:"demo";
  groups:GroupDesign[]; stages:StageDesign[]; assignments:AssignmentDesign[];
}
export interface GroupDesign {id:string;name:string;kind:"control"|"experimental"|"other";status:"active"|"closed"}
export interface StageDesign {id:string;code:string;ordinal:number;status:"active"|"closed";based_on_stage_id:string|null}
export interface AssignmentDesign {id:string;group_id:string;stage_id:string;release_id:string;status:"active"|"closed"}
export interface StudyConstructor {
  create(token:string,title:string):Promise<StudyDesign>;
  read(token:string,id:string):Promise<StudyDesign>;
  group(token:string,id:string,groupId:string|undefined,input:{name:string;kind:GroupDesign["kind"];expected_version:number}):Promise<StudyDesign>;
}
