import type {ParticipantPassports} from "../ports/participant-passport.js";
import {passportScalars} from "../ports/passport-values.js";
import {ParticipationError} from "../ports/errors.js";
function input(value:unknown,save:boolean){
  if(!value||typeof value!=="object"||Array.isArray(value)||Object.keys(value).sort().join(",")!==(save?"expected_revision,schema_version,values":"expected_revision,schema_version"))throw new ParticipationError(400,"INVALID_PASSPORT_VALUES");
  const b=value as Record<string,unknown>;
  if(!Number.isInteger(b.schema_version)||Number(b.schema_version)<1||Number(b.schema_version)>100||!Number.isInteger(b.expected_revision)||Number(b.expected_revision)<0||Number(b.expected_revision)>2147483646)throw new ParticipationError(400,"INVALID_PASSPORT_VALUES");
  return {schema_version:Number(b.schema_version),expected_revision:Number(b.expected_revision)};
}
export function createParticipantPassportApi(passports:ParticipantPassports,csrf:{assert(token:string,value:string):void}){return {
  read:(token:string)=>passports.read(token),
  save:(token:string,value:unknown,proof:string)=>{
    csrf.assert(token,proof);const cas=input(value,true);
    return passports.save(token,{...cas,values:passportScalars((value as Record<string,unknown>).values)});
  },
  complete:(token:string,value:unknown,proof:string)=>{
    csrf.assert(token,proof);return passports.complete(token,input(value,false));
  }
};}
