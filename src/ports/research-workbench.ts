import type {PassportField} from "./passport-schema.js";
import type {StudyDesign} from "./studies.js";
export type WorkbenchAction = "initialize"|"group"|"stage"|"delete_stage"|"assign"|"copy_assignments"|"schema"|"remind";
export interface WorkbenchSchema {schema_version:number;fields:readonly PassportField[];frozen:boolean;study_version:number;study_id:string}
export interface WorkbenchDesign extends StudyDesign {group_notes:Record<string,string>;stage_notes:Record<string,string>;profile_schemas:Record<string,WorkbenchSchema>}
export interface ProgressRow {participant_id:string;group_id:string;stage_id:string;email:string;status:"not_started"|"in_progress"|"completed"}
export interface WorkbenchProgress {openings:{group_id:string;stage_id:string}[];rows:ProgressRow[];reminders:{participant_id:string;stage_id:string;created_at:number}[]}
export interface ResearchWorkbench {
  read(token:string,study:string):Promise<WorkbenchDesign>;
  change(token:string,study:string,version:number,action:WorkbenchAction,input:Record<string,unknown>):Promise<WorkbenchDesign|{queued:number;mode:"synthetic"}>;
  progress(token:string,study:string):Promise<WorkbenchProgress>;
}
export interface ProfileSnapshot {study_id:string;schema_version:number;revision:number;status:"not_started"|"draft"|"completed";fields:readonly PassportField[];values:Readonly<Record<string,string|number>>}
export interface ParticipantProfiles {
  read(token:string):Promise<ProfileSnapshot>;
  change(token:string,action:"restart"|"save"|"complete",input:{schema_version:number;expected_revision:number;values?:Readonly<Record<string,string|number>>}):Promise<ProfileSnapshot>;
}
