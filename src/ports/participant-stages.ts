// Read-only discovery, not an enrollment capability. The later enrollment
// transaction must independently recheck all current requirements and locks.
export interface ParticipantStage {
  readonly stage_id:string;readonly code:string;readonly ordinal:number;
  readonly opening_revision:1;readonly assignment_ids:readonly string[];
}
export interface ParticipantStagesSnapshot {
  readonly study_id:string;readonly group_id:string;
  readonly passport_schema_version:number;readonly passport_completed:boolean;
  readonly required_consents_accepted:boolean;readonly stages:readonly ParticipantStage[];
}
export interface ParticipantStages {read(token:string):Promise<ParticipantStagesSnapshot>}
