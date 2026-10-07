import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {createHash} from "node:crypto";
import {releasePackage,canonicalJson} from "../../storage/releases.js";
import {scoreTki,CONTRACT_VERSION,METHOD_VERSION_ID,HANDLER_VERSION} from "../../core/tki-contract.js";
import {ParticipationError} from "../ports/errors.js";
import type {MethodHandlerRegistry,PinnedMethodHandler} from "../ports/method-handlers.js";

export function pinnedTkiMethodHandlers():MethodHandlerRegistry {
  // Two fixed first-party paths; no submission path, URL, archive or dynamic import.
  const formBytes=readFileSync(resolve(__dirname,"../../methods/tki/form.json"));
  const keyBytes=readFileSync(resolve(__dirname,"../../methods/tki/keys/1.0.0.json"));
  const trusted=releasePackage(),form=JSON.parse(formBytes.toString("utf8")) as {title:string;language:string;version:string;items:{id:string;number:number;options:{value:string;text:string}[]}[]};
  if(canonicalJson(form)!==trusted.formSnapshot)throw new ParticipationError(503,"METHOD_HANDLER_UNAVAILABLE");
  const sha=(b:Uint8Array)=>createHash("sha256").update(b).digest("hex");
  const key=JSON.parse(keyBytes.toString("utf8"));
  if("sha256:"+sha(Buffer.from(JSON.stringify({id:key.id,items:key.items,type:key.type,scales:key.scales})))!==trusted.keyDigest)
    throw new ParticipationError(503,"METHOD_HANDLER_UNAVAILABLE");
  const items=form.items.map(item=>({id:item.id,ordinal:item.number,kind:"single_choice",options:item.options.map(o=>({value:o.value,label:o.text}))}));
  const request=(responses:readonly {item_id:string;value:string|number}[])=>scoreTki({contract_version:CONTRACT_VERSION,method_version_id:METHOD_VERSION_ID,handler_version:HANDLER_VERSION,responses});
  const probe=request(form.items.map(item=>({item_id:item.id,value:"A"})));
  const scales=probe.measures.map(m=>({id:m.code,label:m.label,min:0,max:12,direction:"not_specified"}));
  const handler:PinnedMethodHandler=Object.freeze({method_version_id:METHOD_VERSION_ID,handler_version:HANDLER_VERSION,key_digest:trusted.keyDigest,
    run(responses:Parameters<PinnedMethodHandler["run"]>[0]){const r=request(responses);
      if(r.status!=="scored"||r.warnings.length||r.classifications.length||!r.quality.complete||!r.quality.usable_for_aggregation||r.quality.valid_response_count!==30||r.calculation.key_digest!==trusted.keyDigest||r.measures.length!==5||r.measures.some((m,i)=>m.code!==scales[i]?.id||m.label!==scales[i]?.label||m.representation!=="raw"||m.value_type!=="number"||m.precision!==0||!Number.isInteger(m.value)||m.value<0||m.value>12)||r.measures.reduce((s,m)=>s+m.value,0)!==30)
        throw new ParticipationError(503,"METHOD_HANDLER_UNAVAILABLE");
      return Object.freeze(r.measures.map(m=>Object.freeze({scale_id:m.code,value:m.value})));
    }});
  const formSha=sha(formBytes),keySha=sha(keyBytes),itemShape=canonicalJson(items),scaleShape=canonicalJson(scales);
  return Object.freeze({resolve(pkg:Parameters<MethodHandlerRegistry["resolve"]>[0],evidence:Parameters<MethodHandlerRegistry["resolve"]>[1]){
    if(pkg.method_id!=="tki_ru_30_pairs")return null;
    const artifact=(id:string|null)=>evidence.checked.find(a=>a.artifact_id===id);
    if(pkg.calculation.adapter_id!=="tki-contract"||pkg.calculation.adapter_version!=="0.3.0"||pkg.calculation.kind!=="forced_choice"||pkg.form.version!==form.version||pkg.title!==form.title||pkg.language!==form.language||canonicalJson(pkg.items)!==itemShape||canonicalJson(pkg.scales)!==scaleShape||pkg.norms.status!=="absent"||artifact(pkg.form.artifact_id)?.sha256!==formSha||artifact(pkg.calculation.key_artifact_id)?.sha256!==keySha)
      throw new ParticipationError(400,"METHOD_HANDLER_MISMATCH");
    return handler;
  }});
}
