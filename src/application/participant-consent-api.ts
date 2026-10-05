import type {ParticipantConsents,ConsentAcceptance} from "../ports/participant-consents.js";
import {ParticipationError} from "../ports/errors.js";
export function consentAcceptance(input:unknown):ConsentAcceptance{
  const invalid=()=>{throw new ParticipationError(400,"INVALID_CONSENT_INPUT");};
  if(!input||typeof input!=="object"||Array.isArray(input))invalid();
  const b=input as Record<string,unknown>;
  if(Object.keys(b).sort().join(",")!=="accept,document_version,expected_policy_revision,purpose"||
    !Number.isInteger(b.expected_policy_revision)||Number(b.expected_policy_revision)<0||Number(b.expected_policy_revision)>2147483646||
    (b.purpose!=="study_participation"&&b.purpose!=="secondary_research")||
    typeof b.document_version!=="string"||! /^[a-z][a-z0-9_-]{0,63}$/.test(b.document_version)||b.accept!==true)invalid();
  return {expected_policy_revision:b.expected_policy_revision as number,purpose:b.purpose as ConsentAcceptance["purpose"],document_version:b.document_version as string,accept:true};
}
export function createParticipantConsentApi(consents:ParticipantConsents,csrf:{assert(token:string,value:string):void}){return {
  read:(token:string)=>consents.read(token),
  accept:(token:string,input:unknown,proof:string)=>{csrf.assert(token,proof);return consents.accept(token,consentAcceptance(input));}
};}
