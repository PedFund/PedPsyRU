import type {Pool} from "pg";
import {csrfFor,equalText,validToken} from "../../storage/access.js";
import {ParticipationError} from "../ports/errors.js";
import {PostgresResearchWorkbench,PostgresParticipantProfiles} from "../adapters/postgres/research-workbench.js";
import {createResearchWorkbenchApi,createParticipantProfileApi} from "../application/research-workbench-api.js";
export function researchWorkbenchBoundary(pool:Pool){
  const csrf={assert:(token:string,proof:string)=>{if(!validToken(token)||!equalText(proof,csrfFor(token)))throw new ParticipationError(403,"CSRF_REJECTED");}};
  return {research:createResearchWorkbenchApi(new PostgresResearchWorkbench(pool),csrf),profile:createParticipantProfileApi(new PostgresParticipantProfiles(pool),csrf)};
}
