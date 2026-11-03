"use strict";
const fs=require("node:fs"),path=require("node:path");
// Fixed first-party inputs only. No user paths, code, archives or network loads.
// These descriptors retain source provenance and explicit draft blockers.
function preparedMethodDrafts(){
 const root=path.resolve(__dirname,".."),load=p=>fs.readFileSync(path.join(root,p));
 return [
  {pkg:JSON.parse(load("methods/tki/package-draft.json")),authors:["Кеннет Томас","Ральф Килманн"],search_terms:["ТКИ","конфликт","поведение в конфликте"],
   contents:[{id:"form",path:"form.json",bytes:load("methods/tki/form.json")},{id:"key",path:"key.json",bytes:load("methods/tki/keys/1.0.0.json")},{id:"instruction",path:"instruction.txt",bytes:Buffer.from(JSON.parse(load("methods/tki/form.json")).instruction)},{id:"specification",path:"specification.txt",bytes:Buffer.from("Existing TKI raw handler, pinned verified key1.0.0, no norms.")}]},
  {pkg:JSON.parse(load("methods/karpov/package-draft.json")),authors:["А.В. Карпов"],search_terms:["рефлексивность","рефлексия"],
   contents:[{id:"form",path:"form.json",bytes:load("methods/karpov/form.json")},{id:"key",path:"key.json",bytes:load("methods/karpov/keys/0.1.0-draft.json")},{id:"instruction",path:"instruction.txt",bytes:Buffer.from(JSON.parse(load("methods/karpov/form.json")).instruction)},{id:"specification",path:"specification.txt",bytes:Buffer.from("Legacy raw sum only. Reverse items: 8 minus answer. All 27 answers must be integers 1..7. Norms, stens and levels are not imported.")}]}
 ];
}
module.exports={preparedMethodDrafts};
