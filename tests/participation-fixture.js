"use strict";
const {randomUUID}=require("node:crypto"),{responsesDigest}=require("../storage/releases.js"),{responses}=require("./storage-contract-suite.js");
const {PostgresUnitOfWork}=require("../dist/src/adapters/postgres/unit-of-work.js"),{createParticipationService}=require("../dist/src/application/participation.js");
async function participantService(f){const uow=new PostgresUnitOfWork(f.runtime),context=await uow.context(f.raw),service=createParticipationService(uow,{newId:randomUUID,now:()=>new Date().toISOString(),digest:(ids,v)=>responsesDigest(ids.map(item_id=>({item_id})),v)}),id=f.seed.studies[0].attempts[0].id;
  return {context,service,id,complete:async()=>{const old=await service.read(context,id),saved=await service.save(context,id,{expected_revision:old.revision,current_item_id:"q30",responses:responses()});return service.complete(context,id,{expected_revision:saved.revision});}};}
module.exports={participantService};
