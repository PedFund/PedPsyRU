import type {PassportField} from "./passport-schema.js";
import type {PassportValues} from "./participant-passport.js";
import {ParticipationError} from "./errors.js";
function invalid():never{throw new ParticipationError(400,"INVALID_PASSPORT_VALUES");}
// A pure DTO/feedback helper, not a grant of authority. Fixed guarded SQL must
// independently validate the current pinned schema in the write transaction.
export function passportScalars(input:unknown):Record<string,string|number>{
  if(!input||typeof input!=="object"||Array.isArray(input)||Object.keys(input).length>8)invalid();
  const out:Record<string,string|number>={};
  for(const [key,value] of Object.entries(input)){
    if(!/^(sex|age|city|extra_[a-z][a-z0-9_]{0,31})$/.test(key))invalid();
    if(typeof value==="number"){
      if(!Number.isInteger(value)||value< -1000000||value>1000000)invalid();out[key]=value;
    }else if(typeof value==="string"){
      if(/[\u0000-\u001f\u007f]/.test(value)||/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(value))invalid();
      const text=value.trim();if(!text||Array.from(text).length>500)invalid();out[key]=text;
    }else invalid();
  }return out;
}
export function passportValues(fields:readonly PassportField[],input:unknown,complete=false):PassportValues{
  const values=passportScalars(input),known=new Map(fields.map(f=>[f.key,f]));
  for(const [key,value] of Object.entries(values)){
    const f=known.get(key);if(!f)invalid();
    if(f.kind==="text"){
      if(typeof value!=="string"||Array.from(value).length>f.max_length)invalid();
    }else if(f.kind==="integer"){
      if(typeof value!=="number"||value<f.min||value>f.max)invalid();
    }else if(typeof value!=="string"||!f.options.some(o=>o.value===value))invalid();
  }
  if(complete&&fields.some(f=>f.required&&!Object.hasOwn(values,f.key)))throw new ParticipationError(409,"PASSPORT_INCOMPLETE");
  return values;
}
