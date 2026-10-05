import type {Pool} from "pg";
import {csrfFor,equalText,validToken} from "../../storage/access.js";
import {ParticipationError} from "../ports/errors.js";
import {createParticipantConsentApi} from "../application/participant-consent-api.js";
import {PostgresParticipantConsents} from "../adapters/postgres/participant-consents.js";
// Existing own port only; no identity/legal/operator/bootstrap/migration/key work.
export function consentBoundary(pool:Pool){
  return createParticipantConsentApi(new PostgresParticipantConsents(pool),{assert:(token:string,value:string)=>{
    if(!validToken(token)||!equalText(value,csrfFor(token)))throw new ParticipationError(403,"CSRF_REJECTED");
  }});
}
