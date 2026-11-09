"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const {buildPresentation,normalizeLevel}=require("../dist/src/application/result-presentation.js");

const measure=(code,value)=>({code,label:code,value});
const level=(value)=>({value,label:value+" – уровень"});

test("presentation: machine level codes are translated, Russian labels pass through",()=>{
  assert.equal(normalizeLevel("low"),"низкий");
  assert.equal(normalizeLevel("medium"),"средний");
  assert.equal(normalizeLevel("high"),"высокий");
  assert.equal(normalizeLevel("very_low"),"очень низкий");
  assert.equal(normalizeLevel("extremely_low"),"крайне низкий");
  assert.equal(normalizeLevel("very_high"),"очень высокий");
  assert.equal(normalizeLevel("псевдовысокий"),"псевдовысокий");
  assert.equal(normalizeLevel("unknown_code"),"");
});

test("presentation: Motkov keeps six factor pairs, general A/B and pseudohigh harmony",()=>{
  const codes=["I_A","I_B","II_A","II_B","III_A","III_B","IV_A","IV_B","V_A","V_B","VI_A","VI_B","pk_A","pk_B"];
  const levels=new Map(codes.map(code=>[code,level("псевдовысокий")]).concat([["gpk",level("псевдовысокий")]]));
  const view=buildPresentation("motkov_psychological_culture_18@1.0.0-staging",codes.map(code=>measure(code,4.8)),levels);
  assert.equal(view.title,"Психологическая культура личности");
  assert.equal(view.palette,"positive");
  assert.equal(view.summary_position,"bottom");
  assert.equal(view.groups.length,6);
  assert.deepEqual(view.groups.map(group=>group.measures.length),[2,2,2,2,2,2]);
  assert.equal(view.groups[0].description,"Понимать свои желания, особенности характера и причины своих реакций.");
  assert.equal(view.groups[0].measures[0].label,"Стремление");
  assert.equal(view.groups[0].measures[1].label,"Осуществление");
  assert.equal(view.groups[0].measures[0].colors,4);
  assert.equal(view.groups[0].measures[0].level_index,3);
  assert.match(view.groups[0].measures[0].level_text,/очень сильно/);
  assert.equal(view.summary.measures.length,2);
  assert.equal(view.summary.measures[0].level_index,3);
  assert.equal(view.summary.level.value,"псевдовысокий");
  assert.equal(view.summary.level.index,3);
  assert.equal(view.summary.level.count,4);
  assert.match(view.summary.level.text,/Общий уровень учитывает/);
  const all=[...view.groups.flatMap(group=>group.measures),...view.summary.measures];
  assert.equal(all.length,14);
  for(const item of all){assert.equal(item.min,1);assert.equal(item.max,5);assert.equal(item.colors,4);}
});

test("presentation: Ryff profile has six described bars and one three-level total",()=>{
  const codes=["positive_relations","autonomy","environment_mastery","personal_growth","purpose_in_life","self_acceptance","overall"];
  const view=buildPresentation("ryff_pwb_84_shevelenkova_fesenko@1.0.0-staging",codes.map(code=>measure(code,300)),new Map([["overall",level("низкий")]]));
  assert.equal(view.palette,"positive");
  assert.equal(view.summary_position,"top");
  assert.equal(view.groups.length,1);
  assert.equal(view.groups[0].measures.length,6);
  assert.equal(view.groups[0].measures[0].min,14);
  assert.equal(view.groups[0].measures[0].max,84);
  assert.match(view.groups[0].measures[0].description,/Теплоту и доверие/);
  assert.equal(view.summary.colors,3);
  assert.equal(view.summary.level.value,"низкий");
  assert.equal(view.summary.level.index,0);
  assert.equal(view.summary.measures[0].level_index,0);
  assert.match(view.summary.measures[0].level_text,/выражены слабо/);
  const profile=view.groups[0].measures;
  assert.equal(profile.length,6);
  for(const item of profile){assert.equal(item.min,14);assert.equal(item.max,84);assert.equal(item.colors,2);}
  assert.equal(view.summary.measures[0].min,84);
  assert.equal(view.summary.measures[0].max,504);
  assert.equal(view.summary.measures[0].colors,3);
});

test("presentation: Karpov uses the sten scale and reflexivity_level",()=>{
  const view=buildPresentation("reflexivity_karpov_27@1.0.0-local",[{code:"reflexivity",label:"Рефлексивность",value:108},{code:"reflexivity_sten",label:"Рефлексивность — стен",value:3}],new Map([["reflexivity_level",level("низкий")]]));
  assert.equal(view.groups.length,0);
  assert.equal(view.summary.colors,3);
  assert.equal(view.summary.measures[0].min,1);
  assert.equal(view.summary.measures[0].max,10);
  assert.equal(view.summary.measures[0].level,"низкий");
  assert.equal(view.summary.level.value,"низкий");
});

test("presentation: SJO shows five subscales and a three-level total",()=>{
  const codes=["goals","process","result","locus_self","locus_life","meaningfulness_total"];
  const view=buildPresentation("sjo_20@1.0.0-staging",codes.map(code=>measure(code,30)),new Map(codes.map(code=>[code,level("средний")])));
  assert.equal(view.groups.length,1);
  assert.equal(view.groups[0].measures.length,5);
  assert.equal(view.groups[0].measures[0].max,42);
  assert.equal(view.groups[0].measures[0].level_index,1);
  assert.equal(view.groups[0].measures[0].level_text,null);
  assert.equal(view.summary.colors,3);
  assert.equal(view.summary.level.value,"средний");
  assert.equal(view.summary.level.index,1);
  assert.equal(view.summary.measures[0].max,140);
});

test("presentation: CO36 uses Russian labels and two-color scales without levels",()=>{
  const codes=["family_safety","family_traditions","family_interpersonal_relations","family_normative_conformity","individual_achievement","individual_power_influence","individual_hedonism","individual_activity_stimulation","universal_independence","universal_moral_orientation","universal_tolerance","universal_spiritual"];
  const view=buildPresentation("co36_kunitsyna_36@1.0.0-staging",codes.map(code=>measure(code,6)),new Map());
  assert.equal(view.note,"Нормативные уровни для этой методики не утверждены.");
  assert.equal(view.summary,null);
  assert.equal(view.groups[0].measures.length,12);
  assert.equal(view.groups[0].measures[0].label,"Безопасность семьи");
  assert.equal(view.groups[0].measures[0].min,1);
  assert.equal(view.groups[0].measures[0].max,12);
  assert.equal(view.groups[0].measures[0].colors,2);
  assert.equal(view.groups[0].measures[0].level,null);
});

test("presentation: Hardiness uses three-level scales without numbers",()=>{
  const codes=["commitment","control","challenge","total_hardiness"];
  const view=buildPresentation("hardiness_leontiev_rasskazova_45@1.0.0-staging",codes.map(code=>measure(code,30)),new Map(codes.map(code=>[code,level("средний")])));
  assert.equal(view.groups.length,1);
  assert.equal(view.groups[0].measures.length,3);
  assert.equal(view.groups[0].measures[0].colors,3);
  assert.equal(view.groups[0].measures[0].level_index,1);
  assert.equal(view.groups[0].measures[0].level_text,null);
  assert.equal(view.summary.colors,3);
  assert.equal(view.summary.level.value,"средний");
  assert.equal(view.summary.level.index,1);
  assert.equal(view.summary.measures[0].max,135);
});

test("presentation: Shipilov has three spheres, six conflicts and a five-level total",()=>{
  const codes=["motivational_sphere","obligation_sphere","self_esteem_sphere","motivational","moral","unrealized_desire","role","adaptation","inadequate_self_esteem","total"];
  const view=buildPresentation("uvlk_shipilov@1.0.0-staging",codes.map(code=>measure(code,10)),new Map([["total",level("very_high")]]));
  assert.equal(view.palette,"negative");
  assert.equal(view.groups.length,2);
  assert.deepEqual(view.groups.map(group=>group.measures.length),[3,6]);
  assert.equal(view.groups[0].measures[0].max,54);
  assert.equal(view.groups[1].measures[0].max,18);
  assert.match(view.groups[1].measures[5].description,/исход ситуации расходится/);
  assert.equal(view.summary.colors,5);
  assert.equal(view.summary.level.value,"очень высокий");
  assert.equal(view.summary.level.index,4);
  assert.equal(view.summary.measures[0].level_index,4);
  assert.match(view.summary.measures[0].level_text,/очень сильно/);
  for(const item of view.groups[0].measures){assert.equal(item.min,0);assert.equal(item.max,54);assert.equal(item.colors,2);}
  for(const item of view.groups[1].measures){assert.equal(item.min,0);assert.equal(item.max,18);assert.equal(item.colors,2);}
  assert.equal(view.summary.measures[0].min,0);
  assert.equal(view.summary.measures[0].max,108);
  assert.equal(view.summary.measures[0].colors,5);
});

test("presentation: unknown or non-catalog methods keep the legacy result",()=>{
  assert.equal(buildPresentation("unknown_method@1.0.0-staging",[measure("goals",30)],new Map()),null);
  assert.equal(buildPresentation("",[measure("x",1)],new Map()),null);
});
