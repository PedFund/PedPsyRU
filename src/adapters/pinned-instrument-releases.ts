import type {ParticipantForm} from "../ports/identity.js";
import type {PinnedRelease} from "../ports/participation.js";
import {ParticipationError} from "../ports/errors.js";
import {canonicalJson,releasePackage} from "../../storage/releases.js";
import {prfqReleasePackage} from "../../storage/prfq-release.js";
import {umicsReleasePackage} from "../../storage/umics-release.js";
import {legacyBatchReleases} from "../../storage/legacy-batch-release.js";
import {qlesqReleasePackage} from "../../storage/qlesq-release.js";
import {karpovReleasePackage} from "../../storage/karpov-release.js";

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
function installed():ChoiceRelease[]{
  const t=releasePackage(),k=karpovReleasePackage(),p=prfqReleasePackage(),u=umicsReleasePackage(),q=qlesqReleasePackage();
  return [{...t,itemSnapshots:t.form.items.map(i=>i.options),methodVersionId:"tki_ru_30_pairs@1.0.0",handlerVersion:"tki-contract-0.3.0",verificationState:"key_verified",choiceValues:["A","B"],form:{id:t.form.id,version:t.form.version,items:t.form.items.map(i=>({id:i.id,number:i.number,options:i.options.map(o=>{const option=o as {value:string;text:string};return {value:option.value,text:option.text};})}))}},
    {...k,itemSnapshots:k.form.items.map(i=>i.options),choiceValues:["1","2","3","4","5","6","7"],form:{id:k.form.id,version:k.form.version,title:k.form.title,instruction:k.form.instruction,items:k.form.items.map(i=>({id:i.id,number:i.number,text:i.text,options:i.options.map(o=>({value:o.value,text:o.text}))}))}},
    {...p,itemSnapshots:p.form.items.map(i=>i.options),choiceValues:["1","2","3","4","5","6","7"],form:{id:p.form.id,version:p.form.version,title:p.form.title,instruction:p.form.instruction,items:p.form.items.map(i=>({id:i.id,number:i.number,text:i.text,options:i.options.map(o=>({value:o.value,text:o.text}))}))}},
    {...u,itemSnapshots:u.form.items.map(i=>i.options),choiceValues:["1","2","3","4","5"],form:{id:u.form.id,version:u.form.version,title:u.form.title,instruction:u.form.instruction,items:u.form.items.map(i=>({id:i.id,number:i.number,text:i.text,options:i.options.map(o=>({value:o.value,text:o.text}))}))}},
    {...q,itemSnapshots:q.form.items.map(i=>i.options),choiceValues:["1","2","3","4","5","6","7","8","9","10"],form:{id:q.form.id,version:q.form.version,title:q.form.title,instruction:q.form.instruction,items:q.form.items.map(i=>({id:i.id,number:i.number,text:i.text,options:i.options.map(o=>({value:o.value,text:o.text}))}))}},
    ...legacyBatchReleases().map(b=>({...b,itemSnapshots:b.form.items.map(i=>i.options),choiceValues:b.valid,form:{id:b.form.id,version:b.form.version,title:b.form.title,instruction:b.form.instruction,items:b.form.items.map(i=>({id:i.id,number:i.number,text:i.text,options:i.options.map(o=>({value:o.value,text:o.text}))}))}}))];
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
  if(p.keyDigest!==release.keyDigest)throw new ParticipationError(503,"RELEASE_UNAVAILABLE");return p.form;
}
