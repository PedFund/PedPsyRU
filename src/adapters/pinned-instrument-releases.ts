import type {ParticipantForm} from "../ports/identity.js";
import type {PinnedRelease} from "../ports/participation.js";
import {ParticipationError} from "../ports/errors.js";
import {canonicalJson,releasePackage} from "../../storage/releases.js";
import {prfqReleasePackage} from "../../storage/prfq-release.js";
import {umicsReleasePackage} from "../../storage/umics-release.js";
import {legacyBatchReleases} from "../../storage/legacy-batch-release.js";
import {karpovReleasePackage} from "../../storage/karpov-release.js";
import {approvedV1Releases} from "../../storage/approved-v1-release.js";

interface ReleaseRow {id:string;method_version_id:string;handler_version:string;contract_version:string;form_id:string;form_version:string;form_snapshot:unknown;form_digest:string;key_digest:string;verification_state:string;publication_state:string}
interface ItemRow {item_id:string;ordinal:number;options:unknown}
interface ChoiceRelease {
  methodVersionId:string;handlerVersion:string;verificationState:string;
  form:ParticipantForm;formSnapshot:string;formDigest:string;keyDigest:string;
  itemSnapshots:readonly unknown[];
  choiceValues:readonly string[];
}
// Explicit host composition. Adding a choice method changes this list, not the
// transaction, access checks, retry protocol, enrollment or participant gateway.
type FormShape={id:string;version:string;title?:string;instruction?:string;items:{id:string;number:number;text?:string;options:{value:string;text:string}[]}[]};
function installed():ChoiceRelease[]{
  const t=releasePackage(),k=karpovReleasePackage(),p=prfqReleasePackage(),u=umicsReleasePackage();
  const asForm=(f:FormShape):ParticipantForm=>({id:f.id,version:f.version,
    ...(f.title!==undefined?{title:f.title}:{}),...(f.instruction!==undefined?{instruction:f.instruction}:{}),
    items:f.items.map(item=>({id:item.id,number:item.number,...(item.text!==undefined?{text:item.text}:{}),
      options:item.options.map(option=>({value:String(option.value),text:option.text}))}))});
  const asRelease=(form:FormShape,base:Omit<ChoiceRelease,"itemSnapshots"|"choiceValues"|"form">):ChoiceRelease=>({...base,
    itemSnapshots:form.items.map(item=>item.options),choiceValues:form.items[0]!.options.map(option=>String(option.value)),form:asForm(form)});
  return [
    asRelease(t.form as FormShape,{methodVersionId:"tki_ru_30_pairs@1.0.0",handlerVersion:"tki-contract-0.3.0",verificationState:"key_verified",formSnapshot:t.formSnapshot,formDigest:t.formDigest,keyDigest:t.keyDigest}),
    asRelease(k.form as FormShape,{methodVersionId:k.methodVersionId,handlerVersion:k.handlerVersion,verificationState:k.verificationState,formSnapshot:k.formSnapshot,formDigest:k.formDigest,keyDigest:k.keyDigest}),
    asRelease(p.form as FormShape,{methodVersionId:p.methodVersionId,handlerVersion:p.handlerVersion,verificationState:p.verificationState,formSnapshot:p.formSnapshot,formDigest:p.formDigest,keyDigest:p.keyDigest}),
    asRelease(u.form as FormShape,{methodVersionId:u.methodVersionId,handlerVersion:u.handlerVersion,verificationState:u.verificationState,formSnapshot:u.formSnapshot,formDigest:u.formDigest,keyDigest:u.keyDigest}),
    ...legacyBatchReleases().map(b=>asRelease(b.form as FormShape,{methodVersionId:b.methodVersionId,handlerVersion:b.handlerVersion,verificationState:b.verificationState,formSnapshot:b.formSnapshot,formDigest:b.formDigest,keyDigest:b.keyDigest})),
    ...approvedV1Releases().releases.map(a=>asRelease(a.form as unknown as FormShape,{methodVersionId:a.methodVersionId,handlerVersion:a.handlerVersion,verificationState:a.verificationState,formSnapshot:a.formSnapshot,formDigest:a.formDigest,keyDigest:a.keyDigest}))
  ];
}
function resolve(methodVersionId:string,handlerVersion:string):ChoiceRelease {
  const entry=installed().find(p=>p.methodVersionId===methodVersionId&&p.handlerVersion===handlerVersion);
  if(!entry)throw new ParticipationError(503,"RELEASE_UNAVAILABLE");return entry;
}
export function verifyPinnedChoiceRelease(row:ReleaseRow|undefined,items:readonly ItemRow[]):PinnedRelease {
  if(!row)throw new ParticipationError(503,"RELEASE_UNAVAILABLE");
  const p=resolve(row.method_version_id,row.handler_version);
  if(row.contract_version!=="1.0"||row.form_id!==p.form.id||row.form_version!==p.form.version||canonicalJson(row.form_snapshot)!==p.formSnapshot||row.form_digest!==p.formDigest||row.key_digest!==p.keyDigest||row.verification_state!==p.verificationState||row.publication_state!=="draft"||items.length!==p.form.items.length||items.some((i,n)=>i.item_id!==p.form.items[n]?.id||i.ordinal!==n+1||canonicalJson(i.options)!==canonicalJson(p.itemSnapshots[n])))throw new ParticipationError(503,"RELEASE_UNAVAILABLE");
  return {id:row.id,contractVersion:"1.0",methodVersionId:p.methodVersionId,handlerVersion:p.handlerVersion,keyDigest:p.keyDigest,itemIds:items.map(i=>i.item_id),choiceValues:p.choiceValues};
}
export function pinnedParticipantForm(release:PinnedRelease):ParticipantForm {
  const p=resolve(release.methodVersionId,release.handlerVersion);
  if(p.keyDigest!==release.keyDigest)throw new ParticipationError(503,"RELEASE_UNAVAILABLE");
  // A presentational correction never changes items or options: it only replaces the
  // title and the instruction shown above the stimulus.
  const correction=release.presentation;
  if(!correction)return p.form;
  return {...p.form,...(correction.title?{title:correction.title}:{}),...(correction.instruction!==undefined?{instruction:correction.instruction}:{})};
}
