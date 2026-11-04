import type {ResearchWorkbench,WorkbenchAction,ParticipantProfiles} from "../ports/research-workbench.js";
import {studyObject,studyId,studyText,studyVersion} from "./study-api.js";
import {passportAdditionalFields} from "./passport-schema-api.js";
import {passportScalars} from "../ports/passport-values.js";
import {ParticipationError} from "../ports/errors.js";
function invalid():never{throw new ParticipationError(400,"INVALID_STUDY_INPUT");}
function optionalId(value:unknown){return value===null?null:studyId(value);}
function note(value:unknown){if(typeof value!=="string"||value.length>500||/[\u0000-\u001f\u007f]/.test(value))invalid();return value.trim();}
export function workbenchInput(action:WorkbenchAction,input:unknown):{version:number;data:Record<string,unknown>}{
  const keys={initialize:[],group:["id","name","kind","note"],stage:["id","code","note"],assign:["all","group_id","stage_id","release_ids"],copy_assignments:["stage_id"],delete_stage:["stage_id"],schema:["all","group_id","schema_version","basic_fields","fields"],remind:["group_id","stage_id","request_id"]}[action];
  const b=studyObject(input,["expected_version",...keys]);const version=studyVersion(b.expected_version);let data:Record<string,unknown>={};
  if(action==="group"){if(!["control","experimental","other"].includes(String(b.kind)))invalid();data={id:optionalId(b.id),name:studyText(b.name,100),kind:b.kind,note:note(b.note)};}
  if(action==="stage"){if(typeof b.code!=="string"||!/^T(?:0|[1-4]?\d)$/.test(b.code))invalid();data={id:optionalId(b.id),code:b.code,note:note(b.note)};}
  if(action==="assign"){
    if(typeof b.all!=="boolean"||!Array.isArray(b.release_ids)||b.release_ids.length>10||new Set(b.release_ids).size!==b.release_ids.length)invalid();
    data={all:b.all,group_id:b.all?null:studyId(b.group_id),stage_id:b.all?null:studyId(b.stage_id),release_ids:b.release_ids.map(studyId)};
  }
  if(action==="copy_assignments")data={stage_id:studyId(b.stage_id)};
  if(action==="delete_stage")data={stage_id:studyId(b.stage_id)};
  if(action==="schema"){
    const allowed=["sex","age","city","organization","education"],basic=b.basic_fields;
    if(typeof b.all!=="boolean"||!Array.isArray(basic)||basic.length>allowed.length||
      new Set(basic).size!==basic.length||basic.some(key=>typeof key!=="string"||!allowed.includes(key))||
      !Number.isInteger(b.schema_version)||Number(b.schema_version)<1||Number(b.schema_version)>100)invalid();
    data={all:b.all,group_id:b.all?null:studyId(b.group_id),schema_version:b.schema_version,
      basic_fields:allowed.filter(key=>basic.includes(key)),fields:passportAdditionalFields(b.fields)};
  }
  if(action==="remind")data={group_id:studyId(b.group_id),stage_id:studyId(b.stage_id),request_id:studyId(b.request_id)};
  return {version,data};
}
export function createResearchWorkbenchApi(store:ResearchWorkbench,csrf:{assert(token:string,value:string):void}){return {
  read:(token:string,id:string)=>store.read(token,studyId(id)),
  progress:(token:string,id:string)=>store.progress(token,studyId(id)),
  change:(token:string,id:string,action:WorkbenchAction,input:unknown,proof:string)=>{csrf.assert(token,proof);const b=workbenchInput(action,input);return store.change(token,studyId(id),b.version,action,b.data);}
};}
export function createParticipantProfileApi(store:ParticipantProfiles,csrf:{assert(token:string,value:string):void}){return {
  read:(token:string)=>store.read(token),
  change:(token:string,action:"restart"|"save"|"complete",input:unknown,proof:string)=>{
    csrf.assert(token,proof);const b=studyObject(input,["schema_version","expected_revision",...(action==="save"?["values"]:[])]);
    if(!Number.isInteger(b.schema_version)||Number(b.schema_version)<1||Number(b.schema_version)>100)invalid();
    return store.change(token,action,{schema_version:Number(b.schema_version),expected_revision:studyVersion(b.expected_revision),...(action==="save"?{values:passportScalars(b.values)}:{})});
  }
};}
