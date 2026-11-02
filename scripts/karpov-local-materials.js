"use strict";
const fs=require('node:fs'),path=require('node:path');
function karpovLocalMaterials(){const root=path.resolve(__dirname,'..'),load=file=>fs.readFileSync(path.join(root,'methods/karpov',file)),pkg=JSON.parse(load('package-local.json'));
 return {pkg,contents:[['form','form.json','form-local.json'],['key','key.json','keys/1.0.0-local.json'],['norms','norms.json','norms-local.json'],['applicability','applicability.txt','norm-applicability.txt'],['instruction','instruction.txt','instruction-local.txt'],['specification','specification.txt','specification-local.txt']].map(([id,p,file])=>({id,path:p,bytes:load(file)}))};}
module.exports={karpovLocalMaterials};
