import type {EnrollmentSelection,ParticipantEnrollment} from "../../src/ports/participant-enrollment.js";
const selection:EnrollmentSelection={stage_id:"server-id",expected_opening_revision:1,expected_passport_schema_version:1,expected_consent_policy_revision:0};
// @ts-expect-error Scope cannot be chosen by the caller.
const foreign:EnrollmentSelection={...selection,group_id:"foreign"};
// @ts-expect-error A client approval boolean is not an accepted current consent.
const bypass:EnrollmentSelection={...selection,required_consents_accepted:true};
declare const enrollment:ParticipantEnrollment;
// @ts-expect-error Excluded enrollment self-return has not been approved.
enrollment.reactivate("own",selection);
void foreign;void bypass;
