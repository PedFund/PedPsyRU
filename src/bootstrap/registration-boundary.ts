import type {Pool} from "pg";
import {ContactTokenVault} from "../adapters/security/contact-token-vault.js";
import {SignedRegistrationBrowser} from "../adapters/security/registration-browser.js";
import {PostgresParticipantRegistration} from "../adapters/postgres/participant-registration.js";
import {PostgresRegistrationReceipt} from "../adapters/postgres/registration-receipt.js";
import {PostgresRegistrationDenials} from "../adapters/postgres/registration-denials.js";
import {createRegistrationHttpApi} from "../application/registration-http-api.js";
// Caller retains ownership of the supplied master buffer and zeroes it after
// construction. No migration, delivery, key generation or identity bootstrap.
export function registrationBoundary(pool:Pool,key:Buffer,origin:string){
  const vault=new ContactTokenVault(key),browser=new SignedRegistrationBrowser(key,origin);
  return createRegistrationHttpApi(new PostgresParticipantRegistration(pool,vault),new PostgresRegistrationReceipt(pool,vault,true),browser,new PostgresRegistrationDenials(pool));
}
