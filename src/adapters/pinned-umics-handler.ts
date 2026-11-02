import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {createHash} from "node:crypto";
import {canonicalJson} from "../../storage/releases.js";
import {umicsReleasePackage} from "../../storage/umics-release.js";
import {scoreUmics,CONTRACT_VERSION,METHOD_VERSION_ID,HANDLER_VERSION} from "../../core/umics-contract.js";
import type {MethodHandlerRegistry} from "../ports/method-handlers.js";
import {ParticipationError} from "../ports/errors.js";
export function pinnedUmicsMethodHandler():MethodHandlerRegistry {
 const p=umicsReleasePackage(),items=p.form.items.map(i=>({id:i.id,ordinal:i.number,kind:"single_choice",options:i.options.map(o=>({value:o.value,label:o.text}))}));
 const definitions:[string,string,number,number][]=[["commitment_sum","Обязательство – сумма",5,25],["commitment_mean","Обязательство – среднее",1,5],["exploration_sum","Углубленное исследование – сумма",5,25],["exploration_mean","Углубленное исследование – среднее",1,5],["reconsideration_sum","Пересмотр обязательства – сумма",3,15],["reconsideration_mean","Пересмотр обязательства – среднее",1,5]];
 const scales=definitions.map(([id,label,min,max])=>({id,label,min,max,direction:"not_specified"}));
 const sha=(file:string)=>createHash("sha256").update(readFileSync(resolve(__dirname,file))).digest("hex");
 const pins={form:sha("../../methods/umics/form-local.json"),key:sha("../../methods/umics/key-local.json")};
 return {resolve(pkg,evidence){if(pkg.method_id!=="umics_pi_ru_13")return null;const checked=(id:string|null)=>evidence.checked.find(x=>x.artifact_id===id)?.sha256;
  if(pkg.calculation.adapter_id!=="umics-local"||pkg.calculation.adapter_version!=="1.0.0"||pkg.calculation.kind!=="special"||pkg.form.version!==p.form.version||pkg.title!==p.form.title||pkg.language!==p.form.language||canonicalJson(pkg.items)!==canonicalJson(items)||canonicalJson(pkg.scales)!==canonicalJson(scales)||checked(pkg.form.artifact_id)!==pins.form||checked(pkg.calculation.key_artifact_id)!==pins.key||pkg.norms.status!=="absent")throw new ParticipationError(400,"METHOD_HANDLER_MISMATCH");
  return {method_version_id:METHOD_VERSION_ID,handler_version:HANDLER_VERSION,key_digest:p.keyDigest,run(responses){const result=scoreUmics({contract_version:CONTRACT_VERSION,method_version_id:METHOD_VERSION_ID,handler_version:HANDLER_VERSION,responses});if(result.status!=="scored"||result.calculation.key_digest!==p.keyDigest||!result.quality.complete)throw new ParticipationError(503,"METHOD_HANDLER_UNAVAILABLE");return result.measures.map(m=>({scale_id:m.code,value:m.value}));}};
 }};
}
