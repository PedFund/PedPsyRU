import type {InstrumentRequest,InstrumentResult} from "../ports/instruments.js";
import {builtinInstrumentRegistry} from "./builtin-instrument-modules.js";
import {ParticipationError} from "../ports/errors.js";
import {scoreAuthoringNumeric,authoringKeyDigest,type AuthoringKey} from "../application/authoring-method.js";
export function calculatePinnedInstrument(input:InstrumentRequest,authoring?:unknown):InstrumentResult {
  if(authoring){const key=authoring as AuthoringKey;const result=scoreAuthoringNumeric(input,key);return {...result,calculation:{algorithm_id:"authoring-numeric-1.0.0",key_digest:authoringKeyDigest(key)}};}
  const descriptor=builtinInstrumentRegistry.descriptors().find(d=>d.method_version_id===input.method_version_id&&d.handler_version===input.handler_version&&d.contract_version===input.contract_version);
  if(!descriptor)throw new ParticipationError(503,"RELEASE_UNAVAILABLE");
  return builtinInstrumentRegistry.calculate(descriptor,input) as unknown as InstrumentResult;
}
