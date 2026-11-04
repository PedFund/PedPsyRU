import type {MethodArtifactReader,MethodPackageHasher} from "../ports/method-artifacts.js";
import type {MethodHandlerRegistry} from "../ports/method-handlers.js";
import type {MethodLibrary,PreparedMethodDraft} from "../ports/method-library.js";
import {validateMethodPackageJson} from "./method-package-validation.js";
import {verifyMethodHandler} from "./method-handler-verification.js";
import {ParticipationError} from "../ports/errors.js";
import {pilotMethodReadiness} from "./pilot-method-readiness.js";
// Snapshot each trusted input once, then verify and persist those same owned
// bytes. Re-reading a mutable host source must not change the stored artifacts.
export async function prepareMethodDraft(json:unknown,source:MethodArtifactReader,hasher:MethodPackageHasher,registry:MethodHandlerRegistry):Promise<PreparedMethodDraft>{
  const pkg=validateMethodPackageJson(json).package;const artifacts:{id:string;path:string;bytes:Uint8Array}[]=[];
  for(const a of pkg.artifacts){let bytes;try{bytes=await source.read({method_id:pkg.method_id,package_version:pkg.package_version,artifact:a});}catch{throw new ParticipationError(503,"METHOD_VERIFICATION_UNAVAILABLE");}
    if(!(bytes instanceof Uint8Array)||bytes.byteLength!==a.bytes)throw new ParticipationError(400,"METHOD_ARTIFACT_MISMATCH");
    artifacts.push({id:a.id,path:a.path,bytes:new Uint8Array(bytes)});
  }
  const reader:MethodArtifactReader={read:async({method_id,package_version,artifact})=>{if(method_id!==pkg.method_id||package_version!==pkg.package_version)return null;const found=artifacts.find(a=>a.id===artifact.id&&a.path===artifact.path);return found?new Uint8Array(found.bytes):null;}};
  const verification=await verifyMethodHandler(json,reader,hasher,registry);return {verification,artifacts};
}
export function createMethodLibraryApi(store:MethodLibrary){return {
  planning:async(token:string)=>store.planning(token),
  list:(token:string)=>store.list(token),
  read:(token:string,id:string,version:string)=>{if(!/^[a-z][a-z0-9_]{0,95}$/.test(id)||!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)||version.length>32)throw new ParticipationError(404,"NOT_AVAILABLE");return store.read(token,id,version);},
  catalog:async(token:string,query:unknown)=>{if(typeof query!=="string"||query.length>120||/[\u0000-\u001f\u007f]/.test(query))throw new ParticipationError(400,"INVALID_REQUEST");const q=query.trim().toLocaleLowerCase("ru-RU");return (await store.catalog(token)).filter(m=>[m.title,...m.authors,...m.indicators,...m.search_terms].join(" ").toLocaleLowerCase("ru-RU").includes(q));}
  ,transferStatus:async(token:string)=>({...await store.transferStatus(token),pilot_methods:pilotMethodReadiness()})
};}
