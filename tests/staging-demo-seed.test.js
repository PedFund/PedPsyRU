"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");

const source=fs.readFileSync(path.join(__dirname,"../scripts/seed-staging-demo.js"),"utf8");

test("staging demo seed is guarded to a staging database and synthetic addresses",()=>{
  assert.match(source,/PEDPSY_STAGING_SYNTHETIC/);
  assert.match(source,/\^pedpsy_staging_\[a-f0-9\]\{16\}\$/);
  assert.match(source,/@example\.test/);
  assert.match(source,/PARTICIPANTS=10/);
  assert.match(source,/METHODS=\["tki_ru_30_pairs","sjo_20","hardiness_leontiev_rasskazova_45","qlesq_36_vodopyanova"\]/);
});

test("staging demo seed never targets production or a real address",()=>{
  assert.doesNotMatch(source,/pedpsy_prod_/);
  assert.doesNotMatch(source,/@gmail\.com/);
  assert.doesNotMatch(source,/INSERT INTO pedpsy\.studies\([^)]*\)[^;]*status='active'/s);
});
