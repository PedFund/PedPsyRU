import type {PassportField,PassportSchemas} from "../../src/ports/passport-schema.js";
const field:PassportField={key:"extra_context",label:"Context",kind:"text",max_length:100,required:false};
// @ts-expect-error Psychometric scoring is not a passport question.
const scoring:PassportField={...field,score:1};
// @ts-expect-error The required flag must be a researcher-selected boolean.
const required:PassportField={...field,required:"true"};
declare const schemas:PassportSchemas;
// @ts-expect-error A participant identity cannot be used as a schema edit DTO.
schemas.configure("staff","study",{participant_id:"participant",values:{}});
void scoring;void required;
