"use strict";
const fs=require('node:fs'),path=require('node:path'),root=path.resolve(__dirname,'..');
function prfqLocalMaterials(){const b='methods/prfq/',load=f=>fs.readFileSync(path.join(root,b,f));return {pkg:JSON.parse(load('package-local.json')),contents:[{id:'form',path:'form.json',bytes:load('form-local.json')},{id:'key',path:'key.json',bytes:load('key-local.json')},{id:'norms',path:'norms.json',bytes:load('norms-local.json')},{id:'applicability',path:'applicability.txt',bytes:load('norm-applicability.txt')},{id:'instruction',path:'instruction.txt',bytes:load('instruction-local.txt')},{id:'specification',path:'specification.txt',bytes:load('specification-local.txt')}]};}
module.exports={prfqLocalMaterials};
