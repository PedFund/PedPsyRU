import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {createHash} from "node:crypto";
import {canonicalJson} from "../../storage/releases.js";
import {karpovReleasePackage} from "../../storage/karpov-release.js";
import {scoreKarpov,CONTRACT_VERSION,METHOD_VERSION_ID,HANDLER_VERSION} from "../../core/karpov-contract.js";
import type {MethodHandlerRegistry} from "../ports/method-handlers.js";
import {ParticipationError} from "../ports/errors.js";
export function pinnedKarpovMethodHandler():MethodHandlerRegistry{
 const p=karpovReleasePackage(),items=p.form.items.map(i=>({id:i.id,ordinal:i.number,kind:"single_choice",options:i.options.map(o=>({value:o.value,label:o.text}))}));
 const scales=[{id:"reflexivity",label:"Рефлексивность",min:27,max:189,direction:"not_specified"},{id:"reflexivity_sten",label:"Рефлексивность — стен",min:0,max:10,direction:"not_specified"}];
 const sha=(file:string)=>createHash("sha256").update(readFileSync(resolve(__dirname,file))).digest("hex");
 const pins={form:sha("../../methods/karpov/form-local.json"),key:sha("../../methods/karpov/keys/1.0.0-local.json"),norms:sha("../../methods/karpov/norms-local.json"),applicability:sha("../../methods/karpov/norm-applicability.txt")};
 return {resolve(pkg,evidence){if(pkg.method_id!=="reflexivity_karpov_27")return null;
  const checked=(id:string|null)=>evidence.checked.find(x=>x.artifact_id===id)?.sha256;
  if(pkg.calculation.adapter_id!=="karpov-local"||pkg.calculation.adapter_version!=="1.0.0"||pkg.calculation.kind!=="reverse_sum"||pkg.form.version!==p.form.version||pkg.title!==p.form.title||pkg.language!==p.form.language||canonicalJson(pkg.items)!==canonicalJson(items)||canonicalJson(pkg.scales)!==canonicalJson(scales)||checked(pkg.form.artifact_id)!==pins.form||checked(pkg.calculation.key_artifact_id)!==pins.key||pkg.norms.status!=="evidence_supplied"||checked(pkg.norms.artifact_id)!==pins.norms||checked(pkg.norms.applicability_artifact_id)!==pins.applicability)throw new ParticipationError(400,"METHOD_HANDLER_MISMATCH");
  return {method_version_id:METHOD_VERSION_ID,handler_version:HANDLER_VERSION,key_digest:p.keyDigest,run(responses){const result=scoreKarpov({contract_version:CONTRACT_VERSION,method_version_id:METHOD_VERSION_ID,handler_version:HANDLER_VERSION,responses});if(result.status!=="scored"||result.calculation.key_digest!==p.keyDigest||!result.quality.complete)throw new ParticipationError(503,"METHOD_HANDLER_UNAVAILABLE");return result.measures.map(m=>({scale_id:m.code,value:m.value}));}};
 }};
}
