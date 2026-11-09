"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),m=require("../web/workspace/participant.js");
const study="12345678-1234-1234-1234-123456789abc",invite="A".repeat(43);
test("participant UI: fragment entry never accepts email/role/query authority or invalid token",()=>{assert.deepEqual(m.entry("#join="+invite),{kind:"join",invite});assert.deepEqual(m.entry("#study="+study),{kind:"study",study});assert.deepEqual(m.entry("#participant"),{kind:"participant"});for(const h of ["#join=short","#join="+invite+"&role=staff","#study=foreign","#study="+study+"&email=x@example.test"])assert.throws(()=>m.entry(h));assert.equal(m.ownsPage("#join=bad"),true);assert.equal(m.ownsPage(""),false);});
test("participant UI: group link is fragment only, no invite/email query or path",()=>{const url=new URL(m.groupLink("https://example.test",invite));assert.equal(url.pathname,"/workspace");assert.equal(url.search,"");assert.equal(url.hash,"#join="+invite);assert.throws(()=>m.groupLink("https://example.test","bad"));});
test("participant UI: empty optional input is absent, never zero/imputation; required empty rejects",()=>{assert.equal(m.fieldValue({label:"City",kind:"text",required:false,max_length:80},"   "),undefined);assert.throws(()=>m.fieldValue({label:"Age",kind:"integer",required:true,min:0,max:130},""));});
test("participant UI: strict integer/choices/text bounds and control protection",()=>{const age={label:"Age",kind:"integer",required:true,min:0,max:130};assert.equal(m.fieldValue(age,"30"),30);for(const v of ["1.5","NaN","0x10","1e2","131","-1"])assert.throws(()=>m.fieldValue(age,v));const sex={label:"Sex",kind:"single_choice",required:true,options:[{value:"female",label:"Женский"}]};assert.equal(m.fieldValue(sex,"female"),"female");assert.throws(()=>m.fieldValue(sex,"unknown"));assert.throws(()=>m.fieldValue({kind:"text",max_length:2,required:false,label:"Text"},"long"));});
test("participant UI: every question position returns exactly one pair, pinned current ID required",()=>{const form={items:Array.from({length:30},(_,i)=>({id:"q"+String(i+1).padStart(2,"0"),options:[{value:"A"},{value:"B"}]}))};for(const [index,item]of form.items.entries()){const q=m.question(form,{current_item_id:item.id});assert.equal(q.index,index);assert.equal(q.item,item);assert.equal(q.total,30);assert.equal(q.item.options.length,2);}assert.throws(()=>m.question(form,{current_item_id:"q99"}));});
test("participant UI: changing a choice preserves other answers, exact revision/current slide and no private fields",()=>{const draft={revision:4,current_item_id:"q02",responses:[{item_id:"q01",value:"A",private:"x"},{item_id:"q02",value:"A"}]};const out=m.draftChoice(draft,"q02","B","q03");assert.deepEqual(out,{expected_revision:4,current_item_id:"q03",responses:[{item_id:"q01",value:"A"},{item_id:"q02",value:"B"}]});assert.equal(draft.responses[1].value,"A");assert.throws(()=>m.draftChoice(draft,"q02","C","q03"));});
test("participant UI: labels are escaped, not executable HTML",()=>{assert.equal(m.escape('<img src=x onerror="alert(1)">'),"&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");});

test("participant UI: own role, in-page confirmation and explicit missing normative levels",()=>{const js=fs.readFileSync(path.join(__dirname,"../web/workspace/participant.js"),"utf8"),html=fs.readFileSync(path.join(__dirname,"../web/workspace/index.html"),"utf8");assert.match(js,/Кабинет участника/);assert.match(js,/participant-confirm-dialog/);assert.doesNotMatch(js,/\bconfirm\(/);assert.match(html,/id="participant-confirm-dialog"/);assert.match(js,/Нормативная интерпретация не утверждена/);});

test("participant UI: presentation result draws gradient bars, levels and no scores",()=>{
  const view={title:"Психологическая культура личности",palette:"negative",summary_position:"bottom",groups:[{title:"Самопознание",description:"Понимать свои желания.",measures:[{code:"I_A",label:"Стремление",value:4.8,min:1,max:5,colors:4,description:null,level:"высокий",level_index:2,level_text:"По вашим ответам это стремление выражено сильно."},{code:"positive_relations",label:"Отношения",value:50,min:14,max:84,colors:2,description:"Теплота и доверие.",level:null,level_index:-1,level_text:null}]}],summary:{title:"Общий уровень гармоничности",colors:4,measures:[],level:{code:"gpk",value:"псевдовысокий",text:"Общий уровень учитывает силу стремлений.",index:3,count:4}}};
  const html=m.resultMarkup(view);
  assert.match(html,/result-card palette-negative/);
  assert.ok(html.indexOf("Самопознание")<html.indexOf("Общий уровень гармоничности"));
  assert.match(html,/result-categorical scale-4/);
  assert.match(html,/tone-3 active/);
  assert.match(html,/result-scale scale-2/);
  assert.match(html,/tone-4 active/);
  assert.match(html,/высокий/);
  assert.match(html,/псевдовысокий/);
  assert.match(html,/Спасибо за участие в исследовании/);
  assert.match(html,/Ваш результат/);
  assert.match(html,/Уровень определяется как положение балла относительно количественных границ ключа/);
  assert.equal(html.includes("4.8"),false);
  assert.equal(html.includes(">50<"),false);
});

test("participant UI: ranking uses locked and legacy result copy is updated",()=>{
  const js=fs.readFileSync(path.join(__dirname,"../web/workspace/participant.js"),"utf8");
  assert.match(js,/node\.disabled=locked\|\|used/);
  assert.doesNotMatch(js,/node\.disabled=disabled\|\|used/);
  assert.match(js,/Ваш результат/);
  assert.doesNotMatch(js,/Сохранённый результат/);
  assert.match(js,/Уровень определяется как положение балла относительно количественных границ ключа/);
});
