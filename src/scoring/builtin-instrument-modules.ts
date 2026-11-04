import type {InstrumentRequest,InstrumentResult} from "../ports/instruments.js";
import type {MethodData,MethodRuntimeModule} from "../ports/method-runtime.js";
import {createMethodRuntimeRegistry} from "./method-runtime.js";
import {scoreTki} from "../../core/tki-contract.js";
import {scoreKarpov,KEY_DIGEST as KARPOV_DIGEST} from "../../core/karpov-contract.js";
import {scorePrfq,KEY_DIGEST as PRFQ_DIGEST} from "../../core/prfq-contract.js";
import {scoreUmics,KEY_DIGEST as UMICS_DIGEST} from "../../core/umics-contract.js";
import {scoreLegacyNumeric} from "../../core/legacy-batch-contract.js";
import {entries as legacyNumericEntries} from "../../core/legacy-batch-data.js";
import {entries as approvedV1Entries} from "../../core/approved-v1-data.js";
import {scoreApprovedNumeric, HANDLER_VERSION as APPROVED_NUMERIC_HANDLER} from "../../core/approved-v1-contract.js";
const TKI_DIGEST="sha256:45bc0c8a1b3f154fb3da5df629da6c42613609633594c4f5f54014a301cded7d";

// Compatibility modules for the existing v1 choice-attempt protocol. A v2 module
// can use structured values/state and arbitrary result schemas without changing this protocol.
function choices(options:{method:string;handler:string;digest:string;title:string;authors:string[];count:number;values:string[];score:(input:unknown)=>InstrumentResult;outputs:{id:string;label:string;kind:string}[]}):MethodRuntimeModule {
  const descriptor={contract_version:"1.0",method_version_id:options.method,handler_version:options.handler,key_digest:options.digest,
    title:options.title,authors:options.authors,presentation:{id:"pedpsy/single-choice",version:"1.0"},response_schema:{id:"pedpsy/choice-attempt",version:"1.0"},result_schema:{id:"pedpsy/numeric-profile",version:"1.0"},outputs:options.outputs};
  return {descriptor,
    checkDraft(data){const input=data as unknown as InstrumentRequest;const ids=new Set<string>();
      const valid=Boolean(input&&input.contract_version===descriptor.contract_version&&input.method_version_id===options.method&&input.handler_version===options.handler&&
        Array.isArray(input.responses)&&input.responses.length<=options.count&&input.responses.every(r=>{
          if(!r||typeof r.item_id!=="string"||!/^q\d{2,3}$/.test(r.item_id)||r.item_id!=="q"+String(Number(r.item_id.slice(1))).padStart(2,"0")||Number(r.item_id.slice(1))<1||Number(r.item_id.slice(1))>options.count||ids.has(r.item_id)||!options.values.includes(r.value))return false;ids.add(r.item_id);return true;}));
      return {valid,complete:valid&&ids.size===options.count,issues:valid?[]:["INVALID_RESPONSES"]};},
    calculate:data=>options.score(data) as unknown as MethodData,
    acceptsResult(data){const r=data as unknown as InstrumentResult;return Boolean(r&&r.contract_version===descriptor.contract_version&&r.method_version_id===options.method&&r.handler_version===options.handler&&r.calculation?.key_digest===options.digest&&Array.isArray(r.measures)&&Array.isArray(r.classifications)&&r.measures.every(m=>typeof m.value==="number"&&Number.isFinite(m.value)));},
    participantResult(data){const r=data as unknown as InstrumentResult;return {measures:r.measures.map(m=>({code:m.code,label:m.label,value:m.value,representation:m.representation})),classifications:r.classifications.filter((c):c is {code:string;label:string;value:string}=>Boolean(c&&typeof c==="object"&&"code" in c&&"label" in c&&"value" in c&&typeof c.code==="string"&&typeof c.label==="string"&&typeof c.value==="string")).map(c=>({code:c.code,label:c.label,value:c.value}))};}
  };
}
export const builtinInstrumentRegistry=createMethodRuntimeRegistry([
  choices({method:"tki_ru_30_pairs@1.0.0",handler:"tki-contract-0.3.0",digest:TKI_DIGEST,title:"Томас—Килманн",authors:["К. Томас","Р. Килманн"],count:30,values:["A","B"],score:scoreTki,outputs:[{id:"conflict_profile",label:"Пять стратегий поведения в конфликте",kind:"numeric-profile"}]}),
  choices({method:"reflexivity_karpov_27@1.0.0-local",handler:"karpov-local-1.0.0",digest:KARPOV_DIGEST,title:"Рефлексивность — Карпов",authors:["А.В. Карпов","В.В. Пономарева"],count:27,values:["1","2","3","4","5","6","7"],score:scoreKarpov,outputs:[{id:"reflexivity",label:"Рефлексивность",kind:"raw"},{id:"reflexivity_sten",label:"Рефлексивность — стен",kind:"sten"},{id:"reflexivity_level",label:"Уровень рефлексивности",kind:"category"}]}),
  choices({method:"umics_pi_ru_13@1.0.0-local",handler:"umics-local-1.0.0",digest:UMICS_DIGEST,title:"Родительская идентичность",authors:["К. Пиотровски","Ю.В. Борисенко"],count:13,values:["1","2","3","4","5"],score:scoreUmics,outputs:[{id:"commitment",label:"Обязательство",kind:"raw"},{id:"exploration",label:"Углублённое исследование",kind:"raw"},{id:"reconsideration",label:"Пересмотр обязательства",kind:"raw"}]}),
  choices({method:"prfq_ru_16_kamskaya_2023@1.0.0-local",handler:"prfq-local-1.0.0",digest:PRFQ_DIGEST,title:"Родительское рефлексивное функционирование",authors:["О.А. Камская","М.А. Одинцова","Н.П. Радчикова","Е.В. Гурова"],count:16,values:["1","2","3","4","5","6","7"],score:scorePrfq,outputs:[{id:"prementalizing",label:"Предрефлексия",kind:"raw"},{id:"certainty",label:"Уверенность",kind:"raw"},{id:"interest",label:"Интерес и любопытство",kind:"raw"}]}) ,
  ...legacyNumericEntries.map(p=>choices({method:p.id+"@1.0.0-local",handler:"legacy-numeric-1.0.0",digest:p.pins.key,title:p.title,authors:p.authors,count:p.itemCount,values:p.valid,score:scoreLegacyNumeric,outputs:p.outputs.map(o=>({id:o.id,label:o.label,kind:"raw"}))})),
  // Approved-library packages (Issue #69 content, draft publication state). CO-36 is
  // deliberately absent: its required answer quotas need a ranking screen, not a
  // single-choice form, and must not become assignable as if it were one.
  ...approvedV1Entries.filter(entry=>entry.id!=="co36_kunitsyna_36").map(entry=>{
    const key=entry.key as {scales?:Record<string,unknown>;derived?:Record<string,unknown>;levels?:Record<string,unknown>};
    const names=[...Object.keys(key.scales||{}),...Object.keys(key.derived||{}),...Object.keys(key.levels||{})];
    const unique=names.filter((name,index)=>names.indexOf(name)===index);
    // Descriptor identifiers must be tokens; the human label keeps the full metric name.
    const seen=new Set<string>();
    const outputs=unique.map(name=>{
      const base=name.replace(/[^A-Za-z0-9_.:@/-]+/g,"_").replace(/^[^A-Za-z0-9]+/,"m_");
      let id=base,index=2;
      while(seen.has(id))id=base+"_"+(index++);
      seen.add(id);
      return {id,label:name,kind:"raw"};
    });
    return choices({method:entry.methodVersionId,handler:APPROVED_NUMERIC_HANDLER,digest:entry.pins.key,title:entry.title,
      authors:entry.authors.length?[...entry.authors]:[entry.title],count:entry.itemCount,values:[...entry.valid],
      score:scoreApprovedNumeric,outputs});
  })
]);
