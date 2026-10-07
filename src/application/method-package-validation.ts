import {ParticipationError} from "../ports/errors.js";
import type {MethodItem,MethodPackage,MethodPackageValidation} from "../ports/method-package.js";

const MAX_JSON_BYTES=262144,MAX_ARTIFACT_BYTES=1048576,MAX_TOTAL_ARTIFACT_BYTES=8388608;
const missingFields=["source","instruction","form","key","scales","calculation_specification","handler","control_vectors","norms","rights"];
function invalid():never {throw new ParticipationError(400,"INVALID_METHOD_PACKAGE");}
function record(value:unknown,keys:readonly string[]):Record<string,unknown> {
  if(!value||typeof value!=="object"||Array.isArray(value))invalid();
  const data=value as Record<string,unknown>;
  if(Object.keys(data).length!==keys.length||keys.some(k=>!Object.hasOwn(data,k)))invalid();
  return data;
}
function text(value:unknown,max:number):string {
  if(typeof value!=="string"||!value.trim()||Array.from(value).length>max||/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069\ud800-\udfff]/u.test(value))invalid();
  return value;
}
function id(value:unknown):string {
  if(typeof value!=="string"||! /^[a-z][a-z0-9_-]{0,95}$/.test(value))invalid();return value;
}
function version(value:unknown,formDraft=false):string {
  const pattern=formDraft?/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-draft(?:\.(0|[1-9]\d*))?)?$/:/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
  if(typeof value!=="string"||value.length>32||!pattern.test(value))invalid();return value;
}
function number(value:unknown):number {if(typeof value!=="number"||!Number.isFinite(value))invalid();return value;}
function integer(value:unknown,min:number,max:number):number {
  const n=number(value);if(!Number.isSafeInteger(n)||n<min||n>max)invalid();return n;
}
function oneOf(value:unknown,values:readonly string[]):string {if(typeof value!=="string"||!values.includes(value))invalid();return value;}
function list(value:unknown,max:number):unknown[] {if(!Array.isArray(value)||value.length>max)invalid();return value;}
function unique(values:readonly string[]):Set<string> {const set=new Set(values);if(set.size!==values.length)invalid();return set;}
function refs(value:unknown,allowed:ReadonlySet<string>,max=50):string[] {
  const result=list(value,max).map(id);unique(result);if(result.some(v=>!allowed.has(v)))invalid();return result;
}
function nullableRef(value:unknown,allowed:ReadonlySet<string>):string|null {
  if(value===null)return null;const v=id(value);if(!allowed.has(v))invalid();return v;
}
function bounds(min:unknown,max:unknown,nullable=false):void {
  if(nullable&&min===null&&max===null)return;
  if(number(min)>number(max))invalid();
}
function jsonInput(input:unknown):unknown {
  if(typeof input!=="string"||input.length>MAX_JSON_BYTES)invalid();
  let bytes=0;for(const character of input){const c=character.codePointAt(0)!;bytes+=c<128?1:c<2048?2:c<65536?3:4;if(bytes>MAX_JSON_BYTES)invalid();}
  // JSON.parse alone silently accepts duplicate keys. Inspect structural tokens
  // first, including escaped key spellings, and bound depth before parsing.
  const stack:{object:boolean;expectKey:boolean;keys:Set<string>}[]=[];
  for(let index=0;index<input.length;index++){
    const value=input[index],frame=stack.at(-1);
    if(value==="{"||value==="["){stack.push({object:value==="{",expectKey:value==="{",keys:new Set()});if(stack.length>16)invalid();}
    else if(value==="}"||value==="]")stack.pop();
    else if(value===","){if(frame?.object)frame.expectKey=true;}
    else if(value==='"'){
      const start=index;index++;
      // Single forward scan, not a regexp that retries every escaped quote on
      // an unterminated malicious string. JSON.parse later validates escapes.
      while(index<input.length&&input[index]!=='"'){if(input[index]==="\\")index++;index++;}
      if(index>=input.length)invalid();
      if(frame?.object&&frame.expectKey){let key:unknown;try{key=JSON.parse(input.slice(start,index+1));}catch{invalid();}if(typeof key!=="string"||frame.keys.has(key)||["__proto__","constructor","prototype"].includes(key))invalid();frame.keys.add(key);frame.expectKey=false;}
    }
  }
  try{return JSON.parse(input);}catch{invalid();}
}
function freeze(value:unknown):void {
  if(value&&typeof value==="object"){for(const child of Object.values(value))freeze(child);Object.freeze(value);}
}

// Pure structural validation only: no files, archive extraction, fetch, eval,
// scoring, authentication, database writes, approval or publication.
export function validateMethodPackageJson(input:unknown):MethodPackageValidation {
  const raw=jsonInput(input);
  const p=record(raw,["schema_version","method_id","package_version","title","language","provenance","rights","instruction","form","items","scales","calculation","norms","control_vectors","artifacts","review"]);
  oneOf(p.schema_version,["1.0"]);id(p.method_id);text(p.title,200);
  version(p.package_version);
  if(typeof p.language!=="string"||! /^[a-z]{2,3}(?:-[A-Z]{2})?$/.test(p.language))invalid();
  const review=record(p.review,["technical","scientific","publication"]);
  oneOf(review.technical,["unverified"]);oneOf(review.scientific,["draft"]);oneOf(review.publication,["draft"]);
  const provenance=record(p.provenance,["origin","sources","missing"]);
  oneOf(provenance.origin,["existing_processor","owner_materials","new_sources"]);
  const sources=list(provenance.sources,50).map(s=>{
    const source=record(s,["id","citation","url"]);id(source.id);text(source.citation,2000);
    if(source.url!==null){const urlText=text(source.url,2048);let url:URL;try{url=new URL(urlText);}catch{invalid();}if(url.protocol!=="https:"||url.username||url.password)invalid();}
    return source.id as string;
  });const sourceIds=unique(sources);
  const declaredMissing=list(provenance.missing,10).map(v=>oneOf(v,missingFields));unique(declaredMissing);
  const rights=record(p.rights,["status","source_ids"]);oneOf(rights.status,["unknown","evidence_supplied"]);
  const rightsSources=refs(rights.source_ids,sourceIds);
  if((rights.status==="unknown"&&rightsSources.length)||(rights.status==="evidence_supplied"&&!rightsSources.length))invalid();
  let totalBytes=0;
  const artifacts=list(p.artifacts,32).map(a=>{
    const artifact=record(a,["id","path","bytes","sha256","media_type"]);id(artifact.id);
    const path=text(artifact.path,160),media=oneOf(artifact.media_type,["application/json","text/markdown","text/plain"]);
    // Relative data artifacts only. Never accept code, OS paths, URL refs,
    // encoded separators, dot segments or archive members here.
    if(! /^(?:[a-z0-9_-]+\/)*[a-z0-9_-]+\.(json|md|txt)$/.test(path))invalid();
    if(!path.endsWith(media==="application/json"?".json":media==="text/markdown"?".md":".txt"))invalid();
    totalBytes+=integer(artifact.bytes,1,MAX_ARTIFACT_BYTES);if(totalBytes>MAX_TOTAL_ARTIFACT_BYTES)invalid();
    if(typeof artifact.sha256!=="string"||! /^[a-f0-9]{64}$/.test(artifact.sha256))invalid();return artifact;
  });
  const artifactIds=unique(artifacts.map(a=>a.id as string));unique(artifacts.map(a=>a.path as string));
  const instruction=record(p.instruction,["artifact_id"]);nullableRef(instruction.artifact_id,artifactIds);
  const form=record(p.form,["artifact_id","version"]);nullableRef(form.artifact_id,artifactIds);
  if(form.artifact_id===null){if(form.version!==null)invalid();}else version(form.version,true);
  const items=list(p.items,500).map((v,i)=>{
    const base=v as Record<string,unknown>;const choice=base?.kind==="single_choice";
    const item=record(v,choice?["id","ordinal","kind","options"]:["id","ordinal","kind","min","max"]);
    id(item.id);integer(item.ordinal,i+1,i+1);oneOf(item.kind,["single_choice","integer","number"]);
    if(choice){const options=list(item.options,20).map(o=>{const option=record(o,["value","label"]);text(option.value,64);text(option.label,200);return option.value as string;});if(options.length<2)invalid();unique(options);}
    else{bounds(item.min,item.max);if(item.kind==="integer"){integer(item.min,Number.MIN_SAFE_INTEGER,Number.MAX_SAFE_INTEGER);integer(item.max,Number.MIN_SAFE_INTEGER,Number.MAX_SAFE_INTEGER);}}
    return item;
  });unique(items.map(i=>i.id as string));
  const scales=list(p.scales,100).map(v=>{const scale=record(v,["id","label","min","max","direction"]);id(scale.id);text(scale.label,200);bounds(scale.min,scale.max,true);oneOf(scale.direction,["higher","lower","not_specified"]);return scale;});unique(scales.map(s=>s.id as string));
  const calculation=record(p.calculation,["kind","adapter_id","adapter_version","specification_artifact_id","key_artifact_id"]);
  oneOf(calculation.kind,["sum","reverse_sum","forced_choice","profile","special"]);
  if(calculation.adapter_id!==null){id(calculation.adapter_id);version(calculation.adapter_version);}else if(calculation.adapter_version!==null)invalid();
  nullableRef(calculation.specification_artifact_id,artifactIds);nullableRef(calculation.key_artifact_id,artifactIds);
  const norms=record(p.norms,["status","artifact_id","applicability_artifact_id","source_ids"]);
  oneOf(norms.status,["absent","evidence_supplied"]);nullableRef(norms.artifact_id,artifactIds);nullableRef(norms.applicability_artifact_id,artifactIds);
  const normSources=refs(norms.source_ids,sourceIds);
  if(norms.status==="absent"&&(norms.artifact_id!==null||norms.applicability_artifact_id!==null||normSources.length))invalid();
  if(norms.status==="evidence_supplied"&&(norms.artifact_id===null||norms.applicability_artifact_id===null||!normSources.length))invalid();
  const controls=list(p.control_vectors,20).map(v=>{
    const vector=record(v,["id","data_origin","responses","expected","basis"]);id(vector.id);oneOf(vector.data_origin,["synthetic"]);
    const basis=record(vector.basis,["kind","source_ids"]);oneOf(basis.kind,["independent","legacy_regression"]);
    if(!refs(basis.source_ids,sourceIds).length)invalid();
    const responses=list(vector.responses,500);if(!items.length||responses.length!==items.length)invalid();
    responses.forEach((v,i)=>{const response=record(v,["item_id","value"]),item=items[i]!;
      if(response.item_id!==item.id)invalid();
      const typed=item as unknown as MethodItem;
      if(typed.kind==="single_choice"){if(!typed.options.some(o=>o.value===response.value))invalid();}
      else{const n=number(response.value);if(n<typed.min||n>typed.max||typed.kind==="integer"&&!Number.isSafeInteger(n))invalid();}
    });
    const expected=list(vector.expected,100);if(!scales.length||expected.length!==scales.length)invalid();
    expected.forEach((v,i)=>{const score=record(v,["scale_id","value"]),scale=scales[i]!;if(score.scale_id!==scale.id)invalid();const n=number(score.value);if(scale.min!==null&&(n<number(scale.min)||n>number(scale.max)))invalid();});
    return vector.id as string;
  });unique(controls);
  const blockers=new Set<string>(declaredMissing);
  if(!sources.length)blockers.add("source");if(instruction.artifact_id===null)blockers.add("instruction");
  if(!items.length||form.artifact_id===null)blockers.add("form");if(!scales.length)blockers.add("scales");
  if(calculation.specification_artifact_id===null)blockers.add("calculation_specification");if(calculation.adapter_id===null)blockers.add("handler");
  if(calculation.kind==="forced_choice"&&calculation.key_artifact_id===null)blockers.add("key");
  if(!controls.length)blockers.add("control_vectors");if(rights.status==="unknown")blockers.add("rights");
  blockers.add("artifacts_not_verified");blockers.add("handler_not_verified");blockers.add("scientific_review_required");blockers.add("publication_not_authorized");
  freeze(raw);return Object.freeze({status:"structurally_valid_draft",package:raw as MethodPackage,
    blockers:Object.freeze([...blockers].sort()),publishable:false});
}
