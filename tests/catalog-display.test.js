"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const {methods,forMethod}=require("../web/workspace/catalog-display.js");

const ids=["motkov_psychological_culture_18","ryff_pwb_84_shevelenkova_fesenko","uvlk_shipilov","hardiness_leontiev_rasskazova_45","reflexivity_karpov_27","sjo_20","qlesq_36_vodopyanova","co36_kunitsyna_36","pvq_rr_57","ttf_atf_10","tki_ru_30_pairs"];

test("catalogue display covers every assignable method with Russian metadata",()=>{
  for(const id of ids){
    const view=forMethod(id);
    assert.ok(view,id);
    assert.ok(view.title.length>0,id);
    assert.equal(typeof view.item_count,"number",id);
    assert.ok(view.indicators.length>0,id);
    for(const value of view.indicators) assert.doesNotMatch(value,/[a-z_]{4,}/,id+":"+value);
  }
});

test("catalogue display removes technical codes and abbreviations",()=>{
  const co36=forMethod("co36_kunitsyna_36");
  assert.ok(co36.indicators.includes("Безопасность семьи"));
  assert.ok(!co36.indicators.some(value=>value.includes("family_safety")));
  const qlesq=forMethod("qlesq_36_vodopyanova");
  assert.ok(qlesq.indicators.includes("Работа"));
  assert.ok(qlesq.indicators.includes("Индекс качества жизни"));
  const pvq=forMethod("pvq_rr_57");
  assert.equal(pvq.title,"Портретный ценностный опросник Шварца");
  assert.equal(pvq.item_count,57);
  const ttf=forMethod("ttf_atf_10");
  assert.equal(ttf.title,"Склонность к прощению и отношение к прощению");
  assert.deepEqual(ttf.indicators,["Тенденция к прощению","Отношение к прощению"]);
  const tki=forMethod("tki_ru_30_pairs");
  assert.equal(tki.title,"Томас–Килманн: стили поведения в конфликте");
  assert.equal(tki.item_count,30);
  assert.equal(tki.item_unit,"пар");
  assert.deepEqual(tki.authors,["К. Томас","Р. Х. Килманн"]);
  assert.deepEqual(tki.indicators,["Соперничество","Сотрудничество","Компромисс","Избегание","Приспособление"]);
});

test("catalogue display keeps authors and adaptations separate",()=>{
  assert.deepEqual(forMethod("hardiness_leontiev_rasskazova_45").authors,["С. Мадди"]);
  assert.equal(forMethod("hardiness_leontiev_rasskazova_45").adaptation,"Д. А. Леонтьев, Е. И. Рассказова");
  assert.deepEqual(forMethod("ryff_pwb_84_shevelenkova_fesenko").authors,["К. Рифф"]);
  assert.equal(forMethod("ryff_pwb_84_shevelenkova_fesenko").adaptation,"Т. Д. Шевеленкова, П. П. Фесенко");
});
