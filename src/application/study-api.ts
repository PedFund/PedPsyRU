import type {StudyConstructor,GroupDesign} from "../ports/studies.js";
import {ParticipationError} from "../ports/errors.js";
interface Csrf{assert(token:string,value:string):void}
export function studyObject(input:unknown,keys:string[]):Record<string,unknown>{
  if(!input||typeof input!=="object"||Array.isArray(input)||Object.keys(input).sort().join(",")!==keys.slice().sort().join(","))throw new ParticipationError(400,"INVALID_STUDY_INPUT");
  return input as Record<string,unknown>;
}
export function studyText(input:unknown,max=200):string{
  if(typeof input!=="string"||input.trim().length===0||input.length>max||/[\u0000-\u001f\u007f]/.test(input))throw new ParticipationError(400,"INVALID_STUDY_INPUT");return input.trim();
}
export function studyId(id:unknown):string{
  if(typeof id!=="string"||!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(id))throw new ParticipationError(404,"NOT_AVAILABLE");return id;
}
export function studyVersion(version:unknown):number{if(!Number.isInteger(version)||Number(version)<0||Number(version)>2147483646)throw new ParticipationError(400,"INVALID_STUDY_INPUT");return Number(version);}
export function createStudyApi(studies:StudyConstructor,csrf:Csrf){return {
  listStaff:(token:string)=>studies.listStaff(token),
  create:(token:string,input:unknown,value:string)=>{csrf.assert(token,value);return studies.create(token,studyText(studyObject(input,["title"]).title));},
  createFor:(token:string,input:unknown,value:string)=>{csrf.assert(token,value);const b=studyObject(input,["title","owner_credential_id"]);return studies.createFor(token,studyId(b.owner_credential_id),studyText(b.title));},
  read:(token:string,id:string)=>studies.read(token,studyId(id)),
  group:(token:string,id:string,groupId:string|undefined,input:unknown,value:string)=>{
    csrf.assert(token,value);const b=studyObject(input,["name","kind","expected_version"]);
    if(typeof b.kind!=="string"||!["control","experimental","other"].includes(b.kind))throw new ParticipationError(400,"INVALID_STUDY_INPUT");
    return studies.group(token,studyId(id),groupId===undefined?undefined:studyId(groupId),{name:studyText(b.name,100),kind:b.kind as GroupDesign["kind"],expected_version:studyVersion(b.expected_version)});
  },
  stage:(token:string,id:string,stageId:string|undefined,input:unknown,value:string)=>{
    csrf.assert(token,value);const b=studyObject(input,["code","ordinal","expected_version"]);
    if(!Number.isInteger(b.ordinal)||Number(b.ordinal)<0||Number(b.ordinal)>9999)throw new ParticipationError(400,"INVALID_STUDY_INPUT");
    return studies.stage(token,studyId(id),stageId===undefined?undefined:studyId(stageId),{code:studyText(b.code,40),ordinal:Number(b.ordinal),expected_version:studyVersion(b.expected_version)});
  },
  assign:(token:string,id:string,input:unknown,value:string)=>{
    csrf.assert(token,value);const b=studyObject(input,["group_id","stage_id","release_ids","expected_version"]);
    if(!Array.isArray(b.release_ids)||b.release_ids.length>10||new Set(b.release_ids).size!==b.release_ids.length)throw new ParticipationError(400,"INVALID_STUDY_INPUT");
    return studies.assign(token,studyId(id),{group_id:studyId(b.group_id),stage_id:studyId(b.stage_id),release_ids:b.release_ids.map(studyId),expected_version:studyVersion(b.expected_version)});
  },
  copy:(token:string,id:string,input:unknown,value:string)=>{
    csrf.assert(token,value);const b=studyObject(input,["source_stage_id","code","ordinal","expected_version"]);
    if(!Number.isInteger(b.ordinal)||Number(b.ordinal)<0||Number(b.ordinal)>9999)throw new ParticipationError(400,"INVALID_STUDY_INPUT");
    return studies.copy(token,studyId(id),{source_stage_id:studyId(b.source_stage_id),code:studyText(b.code,40),ordinal:Number(b.ordinal),expected_version:studyVersion(b.expected_version)});
  },
  lifecycle:(token:string,id:string,input:unknown,value:string)=>{
    csrf.assert(token,value);const b=studyObject(input,["status","expected_version"]);
    if(b.status!=="active"&&b.status!=="closed")throw new ParticipationError(400,"INVALID_STUDY_INPUT");
    return studies.lifecycle(token,studyId(id),{status:b.status,expected_version:studyVersion(b.expected_version)});
  },
  title:(token:string,id:string,input:unknown,value:string)=>{
    csrf.assert(token,value);const b=studyObject(input,["title","expected_version"]);
    return studies.title(token,studyId(id),{title:studyText(b.title),expected_version:studyVersion(b.expected_version)});
  }
};}
