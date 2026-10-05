import type {ParticipantStages,ParticipantStage} from "../../src/ports/participant-stages.js";
declare const stages:ParticipantStages;
// @ts-expect-error Discovery never takes caller group or participant scope.
stages.read("own","foreign");
// @ts-expect-error This read-only port cannot create attempts or enrollments.
stages.enroll("own","stage");
const stage:ParticipantStage={stage_id:"server-stage",code:"T1",ordinal:1,opening_revision:1,assignment_ids:[]};
// @ts-expect-error Absence/revision0 is not an opened stage.
const unopened:ParticipantStage={...stage,opening_revision:0};
void unopened;
