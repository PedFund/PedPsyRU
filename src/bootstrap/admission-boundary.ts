import type {Pool} from "pg";
import {csrfFor,equalText,validToken} from "../../storage/access.js";
import {ParticipationError} from "../ports/errors.js";
import {createParticipantStageApi} from "../application/participant-stage-api.js";
import {PostgresParticipantStages} from "../adapters/postgres/participant-stages.js";
import {PostgresParticipantEnrollment} from "../adapters/postgres/participant-enrollment.js";
// Composition only, no SQL/keys/identities/stand initialization at startup.
export function admissionBoundary(pool:Pool){return createParticipantStageApi(new PostgresParticipantStages(pool),new PostgresParticipantEnrollment(pool),
  {assert:(token:string,proof:string)=>{if(!validToken(token)||!equalText(proof,csrfFor(token)))throw new ParticipationError(403,"CSRF_REJECTED");}});}
