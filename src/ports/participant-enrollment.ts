export interface EnrollmentSelection {
  readonly stage_id:string;readonly expected_opening_revision:1;
  readonly expected_passport_schema_version:number;
  readonly expected_consent_policy_revision:number;
}
export interface EnrolledAttempt {
  readonly attempt_id:string;readonly assignment_id:string;readonly release_id:string;
  readonly status:"draft"|"completed";readonly revision:number;readonly current_item_id:string;
}
export interface ParticipantEnrollmentSnapshot {
  readonly study_id:string;readonly group_id:string;readonly stage_id:string;
  readonly enrollment_id:string;readonly attempts:readonly EnrolledAttempt[];
}
// Own session only. Selection/CAS is not authority: atomically lock/recheck
// identity/group/current passport/explicit required consents/opening/releases,
// unique scoped enrollment+attempts, immutable evidence and mandatory audit.
// Never reactivate an excluded record or manufacture a preceding stage.
export interface ParticipantEnrollment {
  enroll(token:string,input:EnrollmentSelection):Promise<ParticipantEnrollmentSnapshot>;
}
