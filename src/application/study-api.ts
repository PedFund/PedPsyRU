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
  create:(token:string,input:unknown,value:string)=>{csrf.assert(token,value);return studies.create(token,studyText(studyObject(input,["title"]).title));},
  read:(token:string,id:string)=>studies.read(token,studyId(id)),
  group:(token:string,id:string,groupId:string|undefined,input:unknown,value:string)=>{
    csrf.assert(token,value);const b=studyObject(input,["name","kind","expected_version"]);
    if(!["control","experimental","other"].includes(String(b.kind)))throw new ParticipationError(400,"INVALID_STUDY_INPUT");
    return studies.group(token,studyId(id),groupId===undefined?undefined:studyId(groupId),{name:studyText(b.name,100),kind:b.kind as GroupDesign["kind"],expected_version:studyVersion(b.expected_version)});
  }
};}
