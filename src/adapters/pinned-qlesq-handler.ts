import {canonicalJson} from "../../storage/releases.js";
import {qlesqLocalMaterials} from "../../scripts/qlesq-local-materials.js";
import {qlesqReleasePackage} from "../../storage/qlesq-release.js";
import {scoreQlesq,CONTRACT_VERSION,METHOD_VERSION_ID,HANDLER_VERSION} from "../../core/qlesq-contract.js";
import type {MethodHandlerRegistry} from "../ports/method-handlers.js";
import {ParticipationError} from "../ports/errors.js";
export function pinnedQlesqMethodHandler():MethodHandlerRegistry{
 const p=qlesqReleasePackage(),m=qlesqLocalMaterials();
 return {resolve(pkg,evidence){
  if(pkg.method_id!=="qlesq_36_vodopyanova")return null;
  if(canonicalJson(pkg)!==canonicalJson(m.pkg)||pkg.calculation.adapter_id!=="qlesq-draft"||pkg.calculation.adapter_version!=="1.0.0"||pkg.calculation.kind!=="special"||
     pkg.artifacts.some(a=>evidence.checked.find(x=>x.artifact_id===a.id)?.sha256!==a.sha256))throw new ParticipationError(400,"METHOD_HANDLER_MISMATCH");
  return {method_version_id:METHOD_VERSION_ID,handler_version:HANDLER_VERSION,key_digest:p.keyDigest,run(responses){
   const result=scoreQlesq({contract_version:CONTRACT_VERSION,method_version_id:METHOD_VERSION_ID,handler_version:HANDLER_VERSION,responses});
   if(result.status!=="scored"||result.calculation.key_digest!==p.keyDigest||!result.quality.complete)throw new ParticipationError(503,"METHOD_HANDLER_UNAVAILABLE");
   const codes=new Set(m.pkg.scales.map(s=>s.id));
   return result.measures.filter(m=>codes.has(m.code)).map(m=>({scale_id:m.code,value:m.value}));
  }};
 }};
}
