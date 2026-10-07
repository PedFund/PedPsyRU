import {ParticipationError} from "../ports/errors.js";
import type {MethodArtifactReader,MethodPackageHasher} from "../ports/method-artifacts.js";
import type {MethodHandlerRegistry,MethodHandlerVerification} from "../ports/method-handlers.js";
import {verifyMethodArtifactIntegrity} from "./method-artifact-integrity.js";

export async function verifyMethodHandler(input:unknown,reader:MethodArtifactReader,hasher:MethodPackageHasher,registry:MethodHandlerRegistry):Promise<MethodHandlerVerification> {
  // Never accept deserialized caller assertions of verified artifacts/approval.
  const validation=await verifyMethodArtifactIntegrity(input,reader,hasher);
  let pinned:ReturnType<MethodHandlerRegistry["resolve"]>;
  try{pinned=registry.resolve(validation.package,validation.evidence);}catch(error){
    if(error instanceof ParticipationError&&error.status===400&&error.code==="METHOD_HANDLER_MISMATCH")throw error;
    throw new ParticipationError(503,"METHOD_HANDLER_UNAVAILABLE");
  }
  const blockers=new Set(validation.blockers);
  const checked:Readonly<{id:string;basis:"independent"|"legacy_regression"}>[]=[];
  if(pinned){
    for(const vector of validation.package.control_vectors){
      let actual:ReturnType<typeof pinned.run>;
      try{actual=pinned.run(vector.responses);}catch{throw new ParticipationError(503,"METHOD_HANDLER_UNAVAILABLE");}
      if(!Array.isArray(actual)||actual.length!==vector.expected.length||actual.some((a,i)=>!a||!Number.isFinite(a.value)||a.scale_id!==vector.expected[i]?.scale_id||a.value!==vector.expected[i]?.value))
        throw new ParticipationError(400,"METHOD_CONTROL_MISMATCH");
      checked.push(Object.freeze({id:vector.id,basis:vector.basis.kind}));
    }
    if(checked.length)blockers.delete("handler_not_verified");
    else blockers.add("control_vectors_required");
    // Executing an expectation is not proof of its independent scientific basis.
    blockers.add("control_basis_review_required");
  }
  return Object.freeze({...validation,blockers:Object.freeze([...blockers].sort()),
    handler:Object.freeze({state:pinned?"pinned":"unsupported",method_version_id:pinned?.method_version_id??null,
      handler_version:pinned?.handler_version??null,key_digest:pinned?.key_digest??null,checked_vectors:Object.freeze(checked)})});
}
