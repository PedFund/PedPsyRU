"use strict";
(async()=>{
  if(location.pathname!=="/take")return;
  const el=id=>document.getElementById(id),form=el("questionnaire"),fields=new Map(),answers=Object.create(null);
  const params=new URLSearchParams(location.search),id=params.get("attempt");
  let data,csrf=null,slideIndex=0,showMissing=false,readOnly=false,queue;
  el("mode-heading").textContent="Тренировочное прохождение";
  el("mode-note").textContent="Только вымышленные ответы. Восстановятся ответы и слайд, сохранение которых подтвердил сервер. Несохранённые изменения могут потеряться.";
  el("mode-footer").textContent="ПедПси · тренировочная база · черновик сохраняется, итоговый результат пока не формируется";
  el("save-panel").hidden=false;el("result").hidden=true;
  el("reset-note").textContent="Ваш сохранённый черновик будет очищен: ответы удалятся, прохождение вернётся к первой паре. Завершённые протоколы не изменяются.";
  el("submit").textContent="Проверить полноту";
  async function request(url,options={}) {
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
    try {
      const response=await fetch(url,{credentials:"same-origin",cache:"no-store",signal:controller.signal,...options});
      const body=await response.json();
      if(!response.ok){const error=new Error("REQUEST_FAILED");error.status=response.status;error.code=body.error;throw error;}
      return body;
    }finally{clearTimeout(timer);}
  }
  function renderStatus(state) {
    const messages={saved:"Сохранено на сервере · ревизия "+state.revision,saving:"Сохраняется… Последние изменения ещё не подтверждены сервером.",
      conflict:"Черновик изменён в другой вкладке. Запись остановлена: чужие изменения не перезаписаны.",
      auth:"Вход истёк или отозван. Последние изменения не сохранены. Войдите снова и откройте назначение.",
      completed:"Протокол уже завершён. Запись остановлена; загрузите актуальное состояние.",readonly:"Завершённый протокол · только чтение.",
      failed:"Сохранение не подтверждено. Сервер мог принять запрос. Сначала загрузите сохранённый черновик; автоматического повтора нет."};
    el("save-status").textContent=messages[state.status]||"Загружаем черновик…";
    el("save-panel").dataset.state=state.status;
    el("reload-draft").hidden=!["conflict","failed","completed"].includes(state.status);
    el("draft-login").hidden=state.status!=="auth";
    const paused=state.blocked && !readOnly;
    for(const field of fields.values())for(const input of field.querySelectorAll("input"))input.disabled=state.blocked;
    el("reset").disabled=state.blocked;el("submit").disabled=state.blocked;
    el("previous").disabled=paused || slideIndex===0;el("next").disabled=paused;
  }
  function summary() {
    const state=PedPsyForm.summarize(data.form.items,answers);
    el("progress").value=state.answered;el("progress-text").textContent="Заполнено "+state.answered+" из "+state.total;
    el("remaining").textContent=state.complete?"Все пары заполнены":"Осталось пар: "+state.missing.length;
    el("submit-hint").textContent="Черновик сохраняется автоматически. Проверка полноты не завершает исследование и не рассчитывает результат.";
    for(const [itemId,field] of fields){const missing=showMissing && state.missing.includes(itemId);field.classList.toggle("is-missing",missing);
      field.querySelector(".pair-error").hidden=!missing;for(const input of field.querySelectorAll("input"))input.setAttribute("aria-invalid",String(missing));}
    el("errors").hidden=!showMissing || state.complete;el("error-text").textContent="Не выбран ответ в парах: "+state.missing.length+".";
    el("missing-links").replaceChildren();
    for(const itemId of state.missing){const link=document.createElement("a");link.href="#"+itemId;link.textContent=String(Number(itemId.slice(1)));
      link.setAttribute("aria-label","Перейти к паре "+Number(itemId.slice(1)));
      link.addEventListener("click",event=>{event.preventDefault();navigate(data.form.items.findIndex(i=>i.id===itemId));});el("missing-links").append(link);}
    return state;
  }
  function showSlide(index,focus=false) {
    const state=PedPsyForm.slideState(data.form.items,index);slideIndex=state.index;
    for(const [itemId,field] of fields)field.hidden=itemId!==state.item_id;
    el("slide-counter").textContent="Вопрос "+state.number+" из "+state.total;
    el("next").hidden=state.isLast;el("submit").hidden=!state.isLast || readOnly;
    if(queue)renderStatus(queue.state());if(focus)fields.get(state.item_id).focus();
  }
  function edited() {
    el("load-status").textContent="";
    queue.edit({current_item_id:data.form.items[slideIndex].id,
      responses:data.form.items.filter(i=>answers[i.id]).map(i=>({item_id:i.id,value:answers[i.id]}))});
    summary();
  }
  function navigate(index) {
    if(queue.state().blocked && !readOnly)return;
    const before=slideIndex;showSlide(index,true);if(!readOnly && before!==slideIndex)edited();
  }
  function apply(s) {
    data=s;readOnly=s.status!=="draft";showMissing=false;
    fields.clear();el("questions").replaceChildren();for(const itemId of Object.keys(answers))delete answers[itemId];
    for(const response of s.responses)answers[response.item_id]=response.value;
    for(const item of s.form.items){
      const field=document.createElement("fieldset");field.className="question";field.id=item.id;field.tabIndex=-1;field.hidden=true;
      const legend=document.createElement("legend");legend.textContent="Пара "+item.number;field.append(legend);
      for(const option of item.options){
        const label=document.createElement("label");label.className="option";const input=document.createElement("input");
        input.type="radio";input.name=item.id;input.id=item.id+"-"+option.value;input.value=option.value;input.checked=answers[item.id]===option.value;
        input.setAttribute("aria-describedby",item.id+"-error");input.addEventListener("change",()=>{answers[item.id]=input.value;edited();});
        const text=document.createElement("span"),code=document.createElement("span");code.className="option-code";code.textContent=option.label+")";
        text.append(code,document.createTextNode(option.text));label.append(input,text);field.append(label);
      }
      const error=document.createElement("p");error.className="pair-error";error.id=item.id+"-error";error.textContent="Выберите один вариант — а или б.";error.hidden=true;
      field.append(error);fields.set(item.id,field);el("questions").append(field);
    }
    el("instruction").textContent=s.form.instruction;el("versions").textContent="Бланк "+s.form_version+" · закреплённый выпуск";
    el("draft-context").textContent=s.stage_code+" · "+s.group_name+" · "+(readOnly?"Завершено":"Черновик");
    el("load-status").textContent="";summary();showSlide(s.form.items.findIndex(i=>i.id===s.current_item_id));queue.load(s);
  }
  try {
    if(params.size!==1 || !id || !/^[0-9a-f-]{36}$/.test(id))throw new Error("INVALID_ATTEMPT");
    const session=await request("/api/auth/session");csrf=session.csrf_token;
    queue=PedPsyDraft.createQueue({onChange:renderStatus,save:async input=>{
      const {attempt}=await request("/api/participant/attempts/"+id+"/draft",{method:"PUT",headers:{"Content-Type":"application/json","X-CSRF-Token":csrf},body:JSON.stringify(input)});
      if(attempt.attempt_id!==id || attempt.release_id!==data.release_id)throw new Error("INVALID_SAVE_ACK");return attempt;
    }});
    apply((await request("/api/participant/attempts/"+id+"/draft")).attempt);
  }catch(error){
    el("load-status").textContent=error.status===401?"Для этого прохождения нужен персональный вход.":"Черновик недоступен. Проверьте назначение или попробуйте позже.";
    el("save-status").textContent="Прохождение не загружено, запись не выполняется.";el("draft-login").hidden=false;return;
  }
  form.addEventListener("submit",async event=>{
    event.preventDefault();if(queue.state().blocked)return;
    if(!PedPsyForm.slideState(data.form.items,slideIndex).isLast){navigate(slideIndex+1);return;}
    showMissing=true;if(!summary().complete){el("errors").focus();return;}
    const state=await queue.flush();if(state.status==="saved")el("load-status").textContent="Все 30 ответов сохранены как черновик. Завершение и итоговый результат подключим следующим шагом.";
  });
  el("previous").addEventListener("click",()=>navigate(slideIndex-1));el("next").addEventListener("click",()=>navigate(slideIndex+1));
  el("reset").addEventListener("click",()=>el("reset-dialog").showModal());
  el("cancel-reset").addEventListener("click",()=>el("reset-dialog").close());
  el("confirm-reset").addEventListener("click",()=>{
    el("reset-dialog").close();if(queue.state().blocked)return;
    for(const itemId of Object.keys(answers))delete answers[itemId];for(const field of fields.values())for(const input of field.querySelectorAll("input"))input.checked=false;
    showMissing=false;el("load-status").textContent="";showSlide(0,true);edited();
  });
  el("reload-draft").addEventListener("click",()=>el("reload-dialog").showModal());
  el("cancel-reload").addEventListener("click",()=>el("reload-dialog").close());
  el("confirm-reload").addEventListener("click",async()=>{
    el("reload-dialog").close();el("reload-draft").disabled=true;
    try{apply((await request("/api/participant/attempts/"+id+"/draft")).attempt);}
    catch(error){el("save-status").textContent="Не удалось загрузить сохранённое состояние. Запись остаётся остановленной.";if(error.status===401)el("draft-login").hidden=false;}
    finally{el("reload-draft").disabled=false;}
  });
  window.addEventListener("beforeunload",event=>{if(queue.state().dirty){event.preventDefault();event.returnValue="";}});
})();
