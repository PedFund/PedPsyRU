import type {InstrumentRequest,InstrumentResult} from "../ports/instruments.js";
import {builtinInstrumentRegistry} from "./builtin-instrument-modules.js";
import {ParticipationError} from "../ports/errors.js";
import {scoreAuthoringNumeric} from "./authoring-numeric.js";
export function calculatePinnedInstrument(input:InstrumentRequest,authoring?:unknown,keyDigest?:string):InstrumentResult {
  if(authoring&&keyDigest){const source=authoring as Parameters<typeof scoreAuthoringNumeric>[1]&{indicator_labels?:readonly string[]};return scoreAuthoringNumeric(input,source.indicator_labels?{...source,labels:source.indicator_labels}:source,keyDigest);}
  const descriptor=builtinInstrumentRegistry.descriptors().find(d=>d.method_version_id===input.method_version_id&&d.handler_version===input.handler_version&&d.contract_version===input.contract_version);
  if(!descriptor)throw new ParticipationError(503,"RELEASE_UNAVAILABLE");
  return builtinInstrumentRegistry.calculate(descriptor,input) as unknown as InstrumentResult;
}
