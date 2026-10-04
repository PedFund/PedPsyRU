import type {ParticipantPassports,PassportSave} from "../../src/ports/participant-passport.js";
declare const own:ParticipantPassports;
const input:PassportSave={schema_version:1,expected_revision:0,values:{sex:"female",age:42}};
// @ts-expect-error Passport answers are scalar values, not scientific formulas.
const formula:PassportSave={...input,values:{age:{formula:"x"}}};
// @ts-expect-error Scope cannot be provided by the participant.
const foreign:PassportSave={...input,participant_id:"foreign"};
// @ts-expect-error Completion uses already saved values, not an inline payload.
own.complete("own",input.values);
void formula;void foreign;
