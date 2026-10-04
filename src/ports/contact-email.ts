import {ParticipationError} from "./errors.js";
// Shared by HTTP validation and trusted adapters. Never fold local case/dots/+
// or invent provider-specific equivalence; preserve the local part for delivery.
export function participantEmail(input:unknown):string{
  const invalid=():never=>{throw new ParticipationError(400,"INVALID_REGISTRATION_INPUT");};
  if(typeof input!=="string"||input.length>254||/[^\x21-\x7e]/.test(input))invalid();
  const parts=(input as string).split("@"),local=parts[0]??"",domain=parts[1]??"";
  if(parts.length!==2||local.length>64||!/^[a-zA-Z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-zA-Z0-9!#$%&'*+/=?^_`{|}~-]+)*$/.test(local)||
    domain.length>253||!domain.includes(".")||domain.split(".").some(label=>!/^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/.test(label)))invalid();
  return local+"@"+domain.toLowerCase();
}
