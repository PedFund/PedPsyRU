import type {RegistrationReceipt} from "../ports/registration-receipt.js";
import {ParticipationError} from "../ports/errors.js";
import {registrationToken} from "./participant-registration-api.js";
import {studyId} from "./study-api.js";

export function createRegistrationReceiptApi(receipts:RegistrationReceipt,protection:{assert(token:string,csrf:string):void}){
  return {
    context:async(invite:string)=>{
      const dto=await receipts.context(registrationToken(invite));
      return {study_id:studyId(dto.study_id),study_title:dto.study_title,group_name:dto.group_name,
        contact_notice:{version:dto.contact_notice.version,text:dto.contact_notice.text,legal_status:"synthetic_only" as const}};
    },
    // Future HTTP route must be POST/same-origin, with its own HttpOnly cookie.
    receipt:(invite:string,browser:string,input:unknown,csrf:string)=>{
      protection.assert(browser,csrf);
      if(!input||typeof input!=="object"||Array.isArray(input)||Object.keys(input).length)throw new ParticipationError(400,"INVALID_REGISTRATION_INPUT");
      return receipts.receipt(registrationToken(invite),registrationToken(browser)).then(dto=>{
        if(dto.synthetic!==true||!Number.isSafeInteger(dto.expires_at)||dto.expires_at<0)throw new ParticipationError(500,"INTERNAL_ERROR");
        return {synthetic:true as const,confirmation_token:registrationToken(dto.confirmation_token),expires_at:dto.expires_at};
      });
    }
  };
}
