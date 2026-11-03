import type {PassportField,PassportSchemas} from "../ports/passport-schema.js";
import {ParticipationError} from "../ports/errors.js";
import {studyId,studyVersion} from "./study-api.js";
function invalid():never{throw new ParticipationError(400,"INVALID_PASSPORT_SCHEMA");}
function object(input:unknown,keys:string[]):Record<string,unknown>{
  if(!input||typeof input!=="object"||Array.isArray(input)||Object.keys(input).sort().join(",")!==keys.slice().sort().join(","))invalid();
  return input as Record<string,unknown>;
}
function label(input:unknown,max:number):string{
  if(typeof input!=="string"||!input.trim()||Array.from(input).length>max||/[\u0000-\u001f\u007f]/.test(input))invalid();
  return input.trim();
}
function integer(input:unknown,min:number,max:number):number{
  if(!Number.isInteger(input)||Number(input)<min||Number(input)>max)invalid();return Number(input);
}
export function passportAdditionalFields(input:unknown):PassportField[]{
  if(!Array.isArray(input)||input.length>5)invalid();
  const keys=new Set<string>();
  return input.map(value=>{
    if(!value||typeof value!=="object"||Array.isArray(value))invalid();
    const kind=(value as Record<string,unknown>).kind;
    const b=object(value,["key","label","required","kind",...(kind==="text"?["max_length"]:kind==="integer"?["min","max"]:kind==="single_choice"?["options"]:[])]);
    if(typeof b.key!=="string"||!/^extra_[a-z][a-z0-9_]{0,31}$/.test(b.key)||keys.has(b.key)||typeof b.required!=="boolean")invalid();
    keys.add(b.key);const base={key:b.key,label:label(b.label,120),required:b.required};
    if(kind==="text")return {...base,kind,max_length:integer(b.max_length,1,500)};
    if(kind==="integer"){
      const min=integer(b.min,-1000000,1000000),max=integer(b.max,-1000000,1000000);if(min>max)invalid();return {...base,kind,min,max};
    }
    if(kind==="single_choice"){
      if(!Array.isArray(b.options)||b.options.length<1||b.options.length>20)invalid();const seen=new Set<string>(),labels=new Set<string>();
      const options=b.options.map(v=>{const o=object(v,["value","label"]);
        if(typeof o.value!=="string"||!/^([a-z][a-z0-9_]{0,39})$/.test(o.value)||seen.has(o.value))invalid();seen.add(o.value);const text=label(o.label,80),folded=text.toLocaleLowerCase("ru-RU");if(labels.has(folded))invalid();labels.add(folded);
        return {value:o.value,label:text};});return {...base,kind,options};
    }return invalid();
  });
}
export function createPassportSchemaApi(schemas:PassportSchemas,csrf:{assert(token:string,value:string):void}){return {
  read:(token:string,id:string)=>schemas.read(token,studyId(id)),
  configure:(token:string,id:string,input:unknown,value:string)=>{
    csrf.assert(token,value);const b=object(input,["expected_version","expected_schema_version","basic_required","additional_fields"]);
    const basic=object(b.basic_required,["city"]);if(typeof basic.city!=="boolean")invalid();
    const schemaVersion=integer(b.expected_schema_version,1,100);
    return schemas.configure(token,studyId(id),{expected_version:studyVersion(b.expected_version),expected_schema_version:schemaVersion,basic_required:{city:basic.city},additional_fields:passportAdditionalFields(b.additional_fields)});
  }
};}
