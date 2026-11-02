import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {createHash} from "node:crypto";
import {canonicalJson} from "../../storage/releases.js";
import {prfqReleasePackage} from "../../storage/prfq-release.js";
import {scorePrfq,CONTRACT_VERSION,METHOD_VERSION_ID,HANDLER_VERSION} from "../../core/prfq-contract.js";
import type {MethodHandlerRegistry} from "../ports/method-handlers.js";
import {ParticipationError} from "../ports/errors.js";
export function pinnedPrfqMethodHandler():MethodHandlerRegistry {
 const p=prfqReleasePackage(),items=p.form.items.map(i=>({id:i.id,ordinal:i.number,kind:"single_choice",options:i.options.map(o=>({value:o.value,label:o.text}))}));
 const scales=[["prementalizing","Предрефлексия"],["certainty","Уверенность"],["interest","Интерес и любопытство"]].flatMap(([id,label])=>[{id,label,min:1,max:7,direction:"not_specified"},{id:id+"_stanine",label:label+" – станайн",min:1,max:9,direction:"not_specified"}]);
 const sha=(file:string)=>createHash("sha256").update(readFileSync(resolve(__dirname,file))).digest("hex");
 const pins={form:sha("../../methods/prfq/form-local.json"),key:sha("../../methods/prfq/key-local.json"),norms:sha("../../methods/prfq/norms-local.json"),applicability:sha("../../methods/prfq/norm-applicability.txt")};
 return {resolve(pkg,evidence){if(pkg.method_id!=="prfq_ru_16_kamskaya_2023")return null;const checked=(id:string|null)=>evidence.checked.find(x=>x.artifact_id===id)?.sha256;
  if(pkg.calculation.adapter_id!=="prfq-local"||pkg.calculation.adapter_version!=="1.0.0"||pkg.calculation.kind!=="special"||pkg.form.version!==p.form.version||pkg.title!==p.form.title||pkg.language!==p.form.language||canonicalJson(pkg.items)!==canonicalJson(items)||canonicalJson(pkg.scales)!==canonicalJson(scales)||checked(pkg.form.artifact_id)!==pins.form||checked(pkg.calculation.key_artifact_id)!==pins.key||pkg.norms.status!=="evidence_supplied"||checked(pkg.norms.artifact_id)!==pins.norms||checked(pkg.norms.applicability_artifact_id)!==pins.applicability)throw new ParticipationError(400,"METHOD_HANDLER_MISMATCH");
  return {method_version_id:METHOD_VERSION_ID,handler_version:HANDLER_VERSION,key_digest:p.keyDigest,run(responses){const result=scorePrfq({contract_version:CONTRACT_VERSION,method_version_id:METHOD_VERSION_ID,handler_version:HANDLER_VERSION,responses});if(result.status!=="scored"||result.calculation.key_digest!==p.keyDigest||!result.quality.complete)throw new ParticipationError(503,"METHOD_HANDLER_UNAVAILABLE");return result.measures.map(m=>({scale_id:m.code,value:m.value}));}};
 }};
}
