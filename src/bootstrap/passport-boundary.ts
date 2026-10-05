import type {Pool} from "pg";
import {csrfFor,equalText,validToken} from "../../storage/access.js";
import {ParticipationError} from "../ports/errors.js";
import {createPassportSchemaApi} from "../application/passport-schema-api.js";
import {createParticipantPassportApi} from "../application/participant-passport-api.js";
import {PostgresPassportSchemas} from "../adapters/postgres/passport-schemas.js";
import {PostgresParticipantPassports} from "../adapters/postgres/participant-passports.js";
// No migration, stand startup, key generation, identity/consent bootstrap.
export function passportBoundary(pool:Pool){
  const csrf={assert:(token:string,value:string)=>{if(!validToken(token)||!equalText(value,csrfFor(token)))throw new ParticipationError(403,"CSRF_REJECTED");}};
  return {schemas:createPassportSchemaApi(new PostgresPassportSchemas(pool),csrf),own:createParticipantPassportApi(new PostgresParticipantPassports(pool),csrf)};
}
