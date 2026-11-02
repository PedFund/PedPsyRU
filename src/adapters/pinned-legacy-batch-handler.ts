import {canonicalJson} from "../../storage/releases.js";
import {legacyBatchReleases} from "../../storage/legacy-batch-release.js";
import {scoreLegacyNumeric,CONTRACT_VERSION,HANDLER_VERSION} from "../../core/legacy-batch-contract.js";
import type {MethodHandlerRegistry} from "../ports/method-handlers.js";
import {ParticipationError} from "../ports/errors.js";
export function pinnedLegacyBatchHandler():MethodHandlerRegistry {
 const releases=legacyBatchReleases();
 return {resolve(pkg,evidence){const p=releases.find(x=>x.id===pkg.method_id);if(!p)return null;
  if(canonicalJson(pkg)!==canonicalJson(p.pkg)||pkg.calculation.adapter_id!=="legacy-numeric"||pkg.calculation.adapter_version!=="1.0.0"||pkg.calculation.kind!=="special"||pkg.artifacts.some(a=>evidence.checked.find(x=>x.artifact_id===a.id)?.sha256!==a.sha256))throw new ParticipationError(400,"METHOD_HANDLER_MISMATCH");
  return {method_version_id:p.methodVersionId,handler_version:HANDLER_VERSION,key_digest:p.keyDigest,run(responses){const result=scoreLegacyNumeric({contract_version:CONTRACT_VERSION,method_version_id:p.methodVersionId,handler_version:HANDLER_VERSION,responses});if(result.status!=="scored"||result.calculation.key_digest!==p.keyDigest||!result.quality.complete)throw new ParticipationError(503,"METHOD_HANDLER_UNAVAILABLE");return result.measures.filter(m=>m.representation==="raw").map(m=>({scale_id:m.code,value:m.value}));}};
 }};
}
