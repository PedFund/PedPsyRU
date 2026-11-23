"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const {forMethod}=require("../web/workspace/catalog-display.js");
const {approvedV1Releases}=require("../storage/approved-v1-release.js");
const {genchiReleasePackage}=require("../storage/genchi-release.js");
const {pinnedParticipantForm}=require("../dist/src/adapters/pinned-instrument-releases.js");

const releases=approvedV1Releases().releases;
function getForm(id){
  const r=releases.find(x=>x.id===id);
  assert.ok(r,id+" is a pinned approved release");
  const form=pinnedParticipantForm({methodVersionId:r.methodVersionId,handlerVersion:r.handlerVersion,keyDigest:r.keyDigest});
  return {release:r,form};
}

test("researcher cards use owner-approved titles, original authors and Russian indicators",()=>{
  const dar=forMethod("darr_7");
  assert.equal(dar.title,"Измерение реакций гнева (DAR-R)");
  assert.deepEqual(dar.authors,["Т. А. Шмарина","Л. Д. Блинова"]);
  assert.equal(dar.adaptation,undefined);
  assert.deepEqual(dar.indicators,["Реагирование гневом","Нарушение, вызванное гневом","Общая реакция гнева"]);

  const affect=forMethod("shpana_20");
  assert.equal(affect.title,"Шкала позитивного аффекта и негативного аффекта (ШПАНА)");
  assert.deepEqual(affect.authors,["Д. Уотсон","Л. А. Кларк","А. Теллеген"]);
  assert.equal(affect.adaptation,"Е. Н. Осин");
  assert.deepEqual(affect.indicators,["Позитивный аффект","Негативный аффект"]);

  const ecv=forMethod("ecv_15");
  assert.equal(ecv.title,"Ценность и самоэффективность эмоционального контроля (ECV-15)");
  assert.deepEqual(ecv.authors,["А. Маус и др."]);
  assert.equal(ecv.adaptation,"А. А. Панкратова");
  assert.deepEqual(ecv.indicators,["Ценность эмоционального контроля","Самоэффективность эмоционального контроля"]);

  const genchi=forMethod("genchi_breath_hold");
  assert.equal(genchi.title,"Проба Генчи");
  assert.deepEqual(genchi.indicators,["Время задержки дыхания, с"]);
  assert.equal(genchi.item_count,0);
});

test("participant forms show correct Russian names and do not change pinned versions",()=>{
  const names={
    darr_7:"Измерение реакций гнева",
    shpana_20:"Шкала позитивного аффекта и негативного аффекта",
    ecv_15:"Эмоциональный контроль"
  };
  for(const [id,title] of Object.entries(names)){
    const {release,form}=getForm(id);
    const snapshot=JSON.parse(release.formSnapshot);
    assert.equal(form.title,title);
    assert.equal(form.items.length,release.itemCount);
    assert.deepEqual(form.items.map(x=>x.text),release.form.items.map(x=>x.text));
    assert.equal(release.formDigest,require("node:crypto").createHash("sha256").update(release.formSnapshot).digest("hex").replace(/^/,"sha256:"));
    assert.equal(snapshot.title,release.form.title,"pinned snapshot is unchanged by display text");
  }
  const g=genchiReleasePackage();
  const form=pinnedParticipantForm({methodVersionId:g.methodVersionId,handlerVersion:g.handlerVersion,keyDigest:g.keyDigest});
  assert.equal(form.title,"Проба Генчи");
});

test("ECV display shows 0..10 while stored answer codes remain 1..11",()=>{
  const {release,form}=getForm("ecv_15");
  const codes=Array.from({length:11},(_,i)=>String(i+1));
  const displayed=Array.from({length:11},(_,i)=>String(i));
  assert.deepEqual(release.form.items[0].options.map(x=>x.value),codes);
  assert.deepEqual(form.items[0].options.map(x=>x.value),codes);
  assert.deepEqual(form.items[0].options.map(x=>x.text),displayed);
  assert.deepEqual(JSON.parse(release.formSnapshot).items[0].options.map(x=>x.text),release.form.items[0].options.map(x=>x.text));
});

test("DAR-R display shows 0..4 with authored wording; stored codes remain 1..5",()=>{
  const {release,form}=getForm("darr_7");
  assert.deepEqual(form.items[0].options.map(x=>x.value),["1","2","3","4","5"]);
  assert.deepEqual(form.items[0].options.map(x=>x.text),[
    "0 – Категорически не согласен",
    "1 – Не согласен",
    "2 – Частично согласен",
    "3 – Согласен",
    "4 – Полностью согласен"
  ]);
  assert.deepEqual(JSON.parse(release.formSnapshot).items[0].options.map(x=>x.text),release.form.items[0].options.map(x=>x.text));
});
