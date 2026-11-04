"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {validate,section,listedItems}=require("../scripts/validate-psytests-packages");
function fixture(n=2){
 const sections=[
  "## 1. Паспорт\n\n| Пунктов | "+n+" |\n",
  "## 2. Название и авторы\n\nТест\n",
  "## 3. Инструкция\n\nОцените утверждения.\n",
  "## 4. Стимульный материал\n\n"+Array.from({length:n},(_,i)=>(i+1)+". Утверждение "+(i+1)).join("\n")+"\n",
  "## 5. Описание\n\nОписание\n",
  "## 6. Ключ\n\n```yaml\nitems: "+n+"\n```\n",
  "## 7. Обработка\n\nСумма\n",
  "## 8. Что проверить\n\nСверено\n",
  "## 9. Источники\n\nhttps://psytests.org/example\n"
 ];
 return sections.join("\n");
}
test("полная секция не обрезается на пустой строке",()=>assert.equal(listedItems(fixture(3)).length,3));
test("корректная структура допускается к предварительному импорту",()=>{
 const x=validate("test.md",fixture());
 assert.equal(x.structure_valid,true);
 assert.equal(x.technically_importable,true);
});
test("незавершенный ключ блокирует импорт",()=>{
 const x=validate("test.md",fixture()+"\nscoring_ready: false\n");
 assert.equal(x.technically_importable,false);
 assert.ok(x.errors.includes("UNCONFIRMED_SCORING_KEY"));
});
test("несовпадение пунктов блокирует импорт",()=>{
 const x=validate("test.md",fixture(3).replace("3. Утверждение 3","5. Утверждение 3"));
 assert.ok(x.errors.includes("NONCONTIGUOUS_ITEM_NUMBERS"));
});
test("необоснованная перекодировка блокирует импорт",()=>{
 const x=validate("test.md",fixture().replace("Сверено","требуется явное правило перекодирования"));
 assert.ok(x.errors.includes("RESPONSE_MAPPING_UNRESOLVED"));
});
