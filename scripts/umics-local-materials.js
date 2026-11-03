'use strict';
const fs=require('node:fs'),path=require('node:path'),root=path.resolve(__dirname,'..');
function umicsLocalMaterials(){const b='methods/umics/',load=f=>fs.readFileSync(path.join(root,b,f));return {pkg:JSON.parse(load('package-local.json')),contents:[{id:'form',path:'form.json',bytes:load('form-local.json')},{id:'key',path:'key.json',bytes:load('key-local.json')},{id:'instruction',path:'instruction.txt',bytes:load('instruction-local.txt')},{id:'specification',path:'specification.txt',bytes:load('specification-local.txt')}]};}
module.exports={umicsLocalMaterials};
