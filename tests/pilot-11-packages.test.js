"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs");
const {manifest,contracts,validate,score,level}=require("../scripts/validate-pilot-11.js");
const byId=id=>contracts.find(x=>x.method_id===id);
const sequence=(count,value)=>Array.from({length:count},()=>value);

test("pilot 11 manifest distinguishes complete, staged and blocked packages",()=>{
  assert.deepEqual(validate(),[]);assert.equal(manifest.methods.length,11);assert.deepEqual(manifest.methods.map(x=>x.number),[1,2,3,4,5,6,7,8,9,10,11]);
  assert.deepEqual(manifest.methods.filter(x=>x.form_status==="awaiting_repository_source").map(x=>x.method_id),["psychological_culture_motkov_18","psychological_wellbeing_ryff_84","pvq_rr_57","ttf_atf_10"]);
  assert.equal(manifest.methods.find(x=>x.method_id==="tki_ru_30_pairs").package_status,"existing_do_not_replace");
  assert.match(manifest.purpose,/not a runtime allowlist/);assert.equal(fs.existsSync("methods/tki/package-draft.json"),true);
});

test("all staged scoring contracts have exact primary-key coverage",()=>{
  for(const contract of contracts){const items=contract.direct?[...contract.direct,...contract.reverse]:Object.values(contract.scales).flatMap(x=>Array.isArray(x)?x:[...x.direct,...x.reverse]);assert.equal(items.length,contract.item_count,contract.method_id);assert.equal(new Set(items).size,contract.item_count,contract.method_id);assert.deepEqual([...new Set(items)].sort((a,b)=>a-b),Array.from({length:contract.item_count},(_,i)=>i+1),contract.method_id);}
});

test("every staged scorer requires all answers, rejects invalid values and never mutates primary responses",()=>{
  for(const contract of contracts){const responses=sequence(contract.item_count,contract.values[0]),before=responses.slice();assert.throws(()=>score(contract,responses.slice(1)),/INCOMPLETE_RESPONSES/);const invalid=responses.slice();invalid[0]=999;assert.throws(()=>score(contract,invalid),/INVALID_RESPONSE/);if(!contract.quota)score(contract,responses);assert.deepEqual(responses,before,contract.method_id);}
});

test("Shipilov maps all six UI choices and preserves approved ranges",()=>{
  const c=byId("uvlk_shipilov"),zero=score(c,sequence(36,1)),max=score(c,sequence(36,4));assert.equal(zero.scales.total,0);assert.equal(zero.levels.total,"extremely_low");for(const id of Object.keys(c.scales))assert.equal(max.scales[id],18);assert.deepEqual([max.scales.motivational_sphere,max.scales.obligation_sphere,max.scales.self_esteem_sphere,max.scales.total],[54,54,54,108]);assert.equal(max.levels.total,"very_high");assert.equal(score(c,sequence(36,6)).scales.total,0);
});

test("Karpov correction has no zero sten and keeps 110 in sten 3",()=>{
  const c=byId("reflexivity_karpov_27"),responses=sequence(27,4);responses[0]=6;const out=score(c,responses);assert.equal(out.scales.reflexivity,110);assert.equal(out.scales.reflexivity_sten,3);assert.equal(out.levels.reflexivity_sten,"low");for(const [raw,expected] of [[27,1],[80,1],[100,1],[101,2],[107,2],[108,3],[113,3],[172,10],[189,10]]){const sten=c.sten.find(([min,max])=>(min===null||raw>=min)&&(max===null||raw<=max))[2];assert.equal(sten,expected,String(raw));assert.notEqual(sten,0);}
});

test("SJO directions, scale overlap and every approved level boundary are deterministic",()=>{
  const c=byId("sjo_20"),out=score(c,sequence(20,1));assert.equal(out.scales.meaningfulness_total,86);assert.equal(out.levels.meaningfulness_total,"low");for(const [id,rows] of Object.entries(c.levels))for(const [min,max,label] of rows){assert.equal(level(rows,min),label,id+":"+min);assert.equal(level(rows,max),label,id+":"+max);}
});

test("hardiness direct/reverse scoring and approved 28/29/20 vector levels",()=>{
  const c=byId("hardiness_leontiev_rasskazova_45"),out=score(c,sequence(45,0));assert.deepEqual({commitment:out.scales.commitment,control:out.scales.control,challenge:out.scales.challenge,total:out.scales.total_hardiness},{commitment:33,control:33,challenge:24,total:90});assert.deepEqual({commitment:level(c.levels.commitment,28),control:level(c.levels.control,29),challenge:level(c.levels.challenge,20),total:level(c.levels.total_hardiness,77)},{commitment:"low",control:"medium",challenge:"high",total:"medium"});
});

test("Q-LES-Q reverses only 21, 33 and 35; item 28 remains direct",()=>{
  const c=byId("qlesq_36_vodopyanova");assert.deepEqual(c.reverse,[21,33,35]);assert.deepEqual(c.explicit_direct_exception,[28]);const base=sequence(36,5),a=score(c,base),changed=base.slice();changed[27]=10;const b=score(c,changed);assert.equal(a.scales.quality_of_life_index,183/9);assert.equal(a.levels.quality_of_life_index,"low");assert.equal(b.scales.optimism-a.scales.optimism,5);assert.ok(Math.abs((b.scales.quality_of_life_index-a.scales.quality_of_life_index)-5/9)<Number.EPSILON*16);
});

test("CO-36 enforces the approved scarce-value quotas before calculating means",()=>{
  const c=byId("co36_kunitsyna_36"),responses=sequence(36,2);[responses[0],responses[1],responses[2],responses[3],responses[4],responses[5],responses[6]]=[12,11,11,10,10,10,1];const out=score(c,responses);assert.equal(Object.keys(out.scales).length,12);assert.equal(out.scales.family_safety,(12+1+2)/3);const invalid=responses.slice();invalid[7]=12;assert.throws(()=>score(c,invalid),/QUOTA_VIOLATION/);
});

test("PVQ-RR produces 19 uncentered means and the four approved higher-order vectors without rounding",()=>{
  const c=byId("pvq_rr_57"),target={BED:11,BEC:11,UNC:12,UNN:12,UNT:12,HE:12,AC:11,FOR:12,FOD:12,FAC:12,SDT:10,SDA:11,ST:11,SES:11,SEP:11,COR:11,COI:11,TR:12,HUM:12},responses=sequence(57,1);for(const [id,items] of Object.entries(c.scales)){const sum=target[id],base=Math.floor(sum/3),rest=sum-base*3,values=[base,base,base];for(let i=0;i<rest;i++)values[i]++;items.forEach((item,i)=>{responses[item-1]=values[i];});}const out=score(c,responses),near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<Number.EPSILON*16);assert.equal(Object.keys(c.scales).length,19);near(out.scales.self_transcendence,58/15);near(out.scales.self_enhancement,59/15);near(out.scales.openness_to_change,44/12);near(out.scales.conservation,80/21);assert.deepEqual(c.display_order,["self_transcendence","self_enhancement","openness_to_change","conservation"]);
});

test("TTF/ATF uses the approved directions and deliberately has no invented norms",()=>{
  const c=byId("ttf_atf_10"),minimum=sequence(10,1),maximum=sequence(10,1);for(const i of [2,3,6,8,9])minimum[i-1]=7;for(const i of [1,4,5,7,10])maximum[i-1]=7;const low=score(c,minimum),high=score(c,maximum);assert.deepEqual(low.scales,{TTF:4,ATF:6});assert.deepEqual(high.scales,{TTF:28,ATF:42});assert.equal(c.norms,null);assert.equal(c.categories,null);
});
