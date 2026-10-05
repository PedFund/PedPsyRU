import type {FastifyInstance,FastifyRequest} from "fastify";
import type {createPassportSchemaApi} from "../application/passport-schema-api.js";
import type {createParticipantPassportApi} from "../application/participant-passport-api.js";
import type {PassportField} from "../ports/passport-schema.js";
import type {ParticipantPassport} from "../ports/participant-passport.js";
import {ParticipationError} from "../ports/errors.js";
import {readParticipantCookie} from "./participant-app.js";
export interface PassportHttpApis {schemas:ReturnType<typeof createPassportSchemaApi>;own:ReturnType<typeof createParticipantPassportApi>}
const fields=(input:readonly PassportField[])=>input.map(f=>{
  const base={key:f.key,label:f.label,required:f.required,kind:f.kind};
  if(f.kind==="text")return {...base,max_length:f.max_length};
  if(f.kind==="integer")return {...base,min:f.min,max:f.max};
  return {...base,options:f.options.map(o=>({value:o.value,label:o.label}))};
});
function ownDto(p:ParticipantPassport){return {study_id:p.study_id,schema_version:p.schema_version,status:p.status,revision:p.revision,fields:fields(p.fields),
  values:Object.fromEntries(p.fields.filter(f=>Object.hasOwn(p.values,f.key)).map(f=>[f.key,p.values[f.key]]))};}
export function registerPassportRoutes(app:FastifyInstance,origin:string,names:{staff:string;researcher:string},apis?:PassportHttpApis):void{
  const participantName=new URL(origin).protocol==="https:"?"__Host-pedpsy":"pedpsy_v2_demo";
  const configured=()=>{if(!apis)throw new ParticipationError(503,"PASSPORT_NOT_CONFIGURED");return apis;};
  const token=(r:FastifyRequest,name:string)=>readParticipantCookie(r.headers.cookie,name);
  const csrf=(r:FastifyRequest)=>typeof r.headers["x-pedpsy-csrf"]==="string"?r.headers["x-pedpsy-csrf"]:"";
  const noQuery=(r:FastifyRequest)=>{if(r.query&&Object.keys(r.query as object).length)throw new ParticipationError(400,"INVALID_REQUEST");};
  for(const [realm,name] of [["researcher",names.researcher],["staff",names.staff]] as const){
    const url=`/api/v2/${realm}/studies/:id/passport-schema`;
    const dto=(p:Awaited<ReturnType<PassportHttpApis["schemas"]["read"]>>)=>({study_id:p.study_id,study_version:p.study_version,schema_version:p.schema_version,frozen:p.frozen,fields:fields(p.fields)});
    app.get(url,async r=>{const a=configured();noQuery(r);return dto(await a.schemas.read(token(r,name),(r.params as {id:string}).id));});
    app.patch(url,async r=>{const a=configured();noQuery(r);return dto(await a.schemas.configure(token(r,name),(r.params as {id:string}).id,r.body,csrf(r)));});
  }
  app.get("/api/v2/participant/passport",async r=>{const a=configured();noQuery(r);return ownDto(await a.own.read(token(r,participantName)));});
  app.put("/api/v2/participant/passport/draft",async r=>{const a=configured();noQuery(r);return ownDto(await a.own.save(token(r,participantName),r.body,csrf(r)));});
  app.post("/api/v2/participant/passport/complete",async r=>{const a=configured();noQuery(r);return ownDto(await a.own.complete(token(r,participantName),r.body,csrf(r)));});
}
