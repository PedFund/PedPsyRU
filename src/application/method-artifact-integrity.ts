import {ParticipationError} from "../ports/errors.js";
import type {MethodArtifactIntegrity,MethodArtifactReader,MethodPackageHasher} from "../ports/method-artifacts.js";
import {validateMethodPackageJson} from "./method-package-validation.js";

// Called only with the already validated, frozen JSON object. Object order is
// canonicalized, array order and text are preserved; no scientific normalization.
function canonical(value:unknown):string {
  if(Array.isArray(value))return "["+value.map(canonical).join(",")+"]";
  if(value&&typeof value==="object")return "{"+Object.keys(value).sort().map(k=>JSON.stringify(k)+":"+canonical((value as Record<string,unknown>)[k])).join(",")+"}";
  return JSON.stringify(value);
}
function digest(hasher:MethodPackageHasher,bytes:Uint8Array):string {
  let result:string;try{result=hasher.sha256(bytes);}catch{throw new ParticipationError(503,"METHOD_VERIFICATION_UNAVAILABLE");}
  if(typeof result!=="string"||! /^[a-f0-9]{64}$/.test(result))throw new ParticipationError(503,"METHOD_VERIFICATION_UNAVAILABLE");
  return result;
}
export async function verifyMethodArtifactIntegrity(input:unknown,reader:MethodArtifactReader,hasher:MethodPackageHasher):Promise<MethodArtifactIntegrity> {
  const validation=validateMethodPackageJson(input),pkg=validation.package;
  const packageDigest=digest(hasher,new TextEncoder().encode(canonical(pkg)));
  const checked:Readonly<{artifact_id:string;path:string;bytes:number;sha256:string}>[]=[];
  for(const artifact of pkg.artifacts){
    let supplied:Uint8Array|null;
    try{supplied=await reader.read(Object.freeze({method_id:pkg.method_id,package_version:pkg.package_version,artifact}));}
    catch{throw new ParticipationError(503,"METHOD_VERIFICATION_UNAVAILABLE");}
    if(!(supplied instanceof Uint8Array)||supplied.byteLength!==artifact.bytes)throw new ParticipationError(400,"METHOD_ARTIFACT_MISMATCH");
    // Own byte snapshot: Buffer.slice would be a mutable view, not a copy.
    const snapshot=new Uint8Array(supplied);
    if(digest(hasher,snapshot)!==artifact.sha256)throw new ParticipationError(400,"METHOD_ARTIFACT_MISMATCH");
    try{new TextDecoder("utf-8",{fatal:true}).decode(snapshot);}catch{throw new ParticipationError(400,"METHOD_ARTIFACT_MISMATCH");}
    checked.push(Object.freeze({artifact_id:artifact.id,path:artifact.path,bytes:snapshot.byteLength,sha256:artifact.sha256}));
  }
  const blockers=new Set(validation.blockers);
  if(checked.length){blockers.delete("artifacts_not_verified");blockers.add("artifact_content_not_validated");}
  // Empty drafts never acquire a positive artifact claim through vacuous truth.
  return Object.freeze({...validation,blockers:Object.freeze([...blockers].sort()),
    evidence:Object.freeze({format:"canonical-json-v1",package_digest:packageDigest,checked:Object.freeze(checked)})});
}
