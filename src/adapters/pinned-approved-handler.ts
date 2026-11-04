import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {canonicalJson} from "../../storage/releases.js";
import {approvedV1Releases} from "../../storage/approved-v1-release.js";
import {createApprovedNumericScorer,CONTRACT_VERSION,HANDLER_VERSION} from "../../core/approved-v1-contract.js";
import {entries as approvedV1Entries} from "../../core/approved-v1-data.js";
const scoreApprovedNumeric=createApprovedNumericScorer(approvedV1Entries);
import {ParticipationError} from "../ports/errors.js";
import type {MethodHandlerRegistry,PinnedMethodHandler} from "../ports/method-handlers.js";

// Trusted host adapter for the approved-library packages. The package shipped in the
// repository is the only accepted shape: a submission that differs by one byte cannot
// obtain a handler, and the returned scale ids are the package's own ids.
export function pinnedApprovedHandler():MethodHandlerRegistry {
  const releases=approvedV1Releases().releases;
  const shipped=new Map(releases.map(release=>[release.id,JSON.parse(readFileSync(
    resolve(__dirname,"../../methods/approved/v1/releases",release.id,"package-local.json"),"utf8"))]));
  return Object.freeze({resolve(pkg:Parameters<MethodHandlerRegistry["resolve"]>[0],evidence:Parameters<MethodHandlerRegistry["resolve"]>[1]){
    const release=releases.find(candidate=>candidate.id===pkg.method_id);
    if(!release)return null;
    const trusted=shipped.get(release.id);
    if(canonicalJson(pkg)!==canonicalJson(trusted)||pkg.calculation.adapter_id!=="approved-numeric"||
      pkg.calculation.adapter_version!=="1.0.0"||
      pkg.artifacts.some(artifact=>evidence.checked.find(checked=>checked.artifact_id===artifact.id)?.sha256!==artifact.sha256))
      throw new ParticipationError(400,"METHOD_HANDLER_MISMATCH");
    const scaleByLabel=new Map<string,string>((pkg.scales as unknown as readonly {id:string;label:string}[]).map(scale=>[scale.label,scale.id]));
    const handler:PinnedMethodHandler=Object.freeze({method_version_id:release.methodVersionId,handler_version:HANDLER_VERSION,key_digest:release.keyDigest,
      run(responses:Parameters<PinnedMethodHandler["run"]>[0]){
        const result=scoreApprovedNumeric({contract_version:CONTRACT_VERSION,method_version_id:release.methodVersionId,handler_version:HANDLER_VERSION,responses});
        if(result.status!=="scored"||result.calculation.key_digest!==release.keyDigest||!result.quality.complete)
          throw new ParticipationError(503,"METHOD_HANDLER_UNAVAILABLE");
        return result.measures.filter(measure=>measure.representation==="raw").map(measure=>{
          const scaleId=scaleByLabel.get(measure.label);
          if(!scaleId)throw new ParticipationError(503,"METHOD_HANDLER_UNAVAILABLE");
          return Object.freeze({scale_id:scaleId,value:measure.value});
        });
      }});
    return handler;
  }});
}
