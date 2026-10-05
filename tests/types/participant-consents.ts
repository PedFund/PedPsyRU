import type {ConsentAcceptance,ParticipantConsents} from "../../src/ports/participant-consents.js";
const accepted:ConsentAcceptance={expected_policy_revision:0,purpose:"study_participation",document_version:"demo-participation-1",accept:true};
// @ts-expect-error A refusal is not a persisted acceptance.
const refused:ConsentAcceptance={...accepted,accept:false};
// @ts-expect-error Contact acknowledgement is recorded by the separate registration flow.
const contact:ConsentAcceptance={...accepted,purpose:"contact_processing"};
// @ts-expect-error Caller participant identity cannot define consent scope.
const foreign:ConsentAcceptance={...accepted,participant_id:"foreign"};
declare const consents:ParticipantConsents;
// @ts-expect-error No participant withdrawal/self-return workflow was approved.
consents.withdraw("own");
void refused;void contact;void foreign;
