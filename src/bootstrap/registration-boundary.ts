import type {Pool} from "pg";
import {ContactTokenVault} from "../adapters/security/contact-token-vault.js";
import {SignedRegistrationBrowser} from "../adapters/security/registration-browser.js";
import {PostgresParticipantRegistration} from "../adapters/postgres/participant-registration.js";
import {PostgresRegistrationReceipt} from "../adapters/postgres/registration-receipt.js";
import {PostgresRegistrationDenials} from "../adapters/postgres/registration-denials.js";
import {createRegistrationHttpApi} from "../application/registration-http-api.js";
import type {ParticipantAdmissionPolicy} from "../ports/login-policy.js";
// Caller retains ownership of the supplied master buffer and zeroes it after
// construction. No migration, delivery, key generation or identity bootstrap.
export function registrationBoundary(pool:Pool,key:Buffer,origin:string,allowRealEmail=false,admission?:ParticipantAdmissionPolicy,mailDelivery=false,
  mailer?:{send(message:{to:string;subject:string;text:string}):Promise<void>}){
  const vault=new ContactTokenVault(key),browser=new SignedRegistrationBrowser(key,origin),synthetic=!mailDelivery;
  return createRegistrationHttpApi(new PostgresParticipantRegistration(pool,vault,undefined,allowRealEmail,admission,mailer),new PostgresRegistrationReceipt(pool,vault,synthetic),browser,new PostgresRegistrationDenials(pool),synthetic?"synthetic":"email");
}
