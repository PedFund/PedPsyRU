import type {PassportField} from "./passport-schema.js";
export type PassportValues = Readonly<Record<string,string|number>>;
export interface ParticipantPassport {
  readonly study_id:string; readonly schema_version:number;
  readonly status:"not_started"|"draft"|"completed"; readonly revision:number;
  readonly fields:readonly PassportField[]; readonly values:PassportValues;
}
export interface PassportSave {readonly schema_version:number;readonly expected_revision:number;readonly values:PassportValues}
export interface PassportCompletion {readonly schema_version:number;readonly expected_revision:number}
// Scope comes only from the participant's own current session. No caller IDs,
// staff impersonation, contact data, scientific scoring or auto-enrollment.
export interface ParticipantPassports {
  read(token:string):Promise<ParticipantPassport>;
  save(token:string,input:PassportSave):Promise<ParticipantPassport>;
  complete(token:string,input:PassportCompletion):Promise<ParticipantPassport>;
}
