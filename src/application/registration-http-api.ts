import type {ParticipantRegistration} from "../ports/participant-registration.js";
import type {RegistrationReceipt} from "../ports/registration-receipt.js";
import type {RegistrationBrowser,RegistrationDenials} from "../ports/registration-browser.js";
import {createParticipantRegistrationApi} from "./participant-registration-api.js";
import {createRegistrationReceiptApi} from "./registration-receipt-api.js";
export function createRegistrationHttpApi(registration:ParticipantRegistration,receipts:RegistrationReceipt,browser:RegistrationBrowser,denials:RegistrationDenials){
  const core=createParticipantRegistrationApi(registration,browser),test=createRegistrationReceiptApi(receipts,browser);
  return {
    // Internal token goes into HttpOnly cookie only, never the response JSON.
    preflight:(previous:string)=>{const token=browser.valid(previous)?previous:browser.create();return {token,csrf:browser.csrf(token),expiresAt:browser.expiresAt(token)};},
    context:test.context,start:core.start,confirm:core.confirm,
    receipt:async(invite:string,token:string,input:unknown,csrf:string)=>{const dto=await test.receipt(invite,token,input,csrf);return {...dto,expires_at:Math.min(dto.expires_at,browser.expiresAt(token))};},
    login:(input:unknown,token:string,csrf:string)=>{browser.assert(token,csrf);return core.login(input);},
    denied:(reason:string)=>denials.record(reason)
  };
}
