import type {ConsentPurpose} from "./participant-registration.js";
export type ExplicitConsentPurpose = Exclude<ConsentPurpose,"contact_processing">;
export interface ParticipantConsentDocument {
  readonly purpose:ConsentPurpose;readonly version:string;readonly text:string;
  readonly legal_status:"synthetic_only";readonly required:boolean;
  readonly accepted_at_ms:number|null;
  readonly provenance:"contact_notice_confirmation"|"explicit_participant_acceptance";
}
export interface ParticipantConsentsSnapshot {
  readonly study_id:string;readonly policy_revision:number;
  readonly documents:readonly ParticipantConsentDocument[];
  readonly required_consents_accepted:boolean;
}
export interface ConsentAcceptance {
  readonly expected_policy_revision:number;readonly purpose:ExplicitConsentPurpose;
  readonly document_version:string;readonly accept:true;
}
export interface ParticipantConsents {
  read(token:string):Promise<ParticipantConsentsSnapshot>;
  accept(token:string,input:ConsentAcceptance):Promise<ParticipantConsentsSnapshot>;
}
