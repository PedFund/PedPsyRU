"use strict";
(async()=>{
  if(location.pathname!=="/take")return;
  const el=id=>document.getElementById(id),form=el("questionnaire"),fields=new Map(),answers=Object.create(null);
  const params=new URLSearchParams(location.search),id=params.get("attempt");
  let data,csrf=null,slideIndex=0,showMissing=false,readOnly=false,queue,finishing=false,completionPaused=false;
  el("mode-heading").textContent="Тренировочное прохождение";
  el("mode-note").textContent="Только вымышленные ответы. Восстановятся ответы и слайд, сохранение которых подтвердил сервер. Несохранённые изменения могут потеряться.";
  el("mode-footer").textContent="ПедПси · тренировочная база · ответы и сырые результаты сохраняются";
  el("save-panel").hidden=false;el("result").hidden=true;
  el("reset-note").textContent="Ваш сохранённый черновик будет очищен: ответы удалятся, прохождение вернётся к первой паре. Завершённые протоколы не изменяются.";
  el("submit").textContent="Завершить прохождение";
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
    if(finishing)el("save-status").textContent="Сохраняем последний снимок и завершаем прохождение…";
    if(completionPaused){el("save-status").textContent="Завершение не подтверждено. Протокол мог уже завершиться. Сначала загрузите состояние с сервера; запись остановлена.";el("reload-draft").hidden=false;el("draft-login").hidden=false;}
    const locked=state.blocked || finishing || completionPaused;
    const paused=(state.blocked && !readOnly) || finishing || completionPaused;
    for(const field of fields.values())for(const input of field.querySelectorAll("input"))input.disabled=locked;
    el("reset").disabled=locked;el("submit").disabled=locked;
    el("previous").disabled=paused || slideIndex===0;el("next").disabled=paused;
  }
  function summary() {
    const state=PedPsyForm.summarize(data.form.items,answers);
    el("progress").value=state.answered;el("progress-text").textContent="Заполнено "+state.answered+" из "+state.total;
    el("remaining").textContent=state.complete?"Все пары заполнены":"Осталось пар: "+state.missing.length;
    el("submit-hint").textContent=readOnly?"Завершённые ответы нельзя изменить или очистить.":"Черновик сохраняется автоматически. Для завершения нужны все 30 ответов; после завершения изменить их нельзя.";
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
    if(finishing || completionPaused || (queue.state().blocked && !readOnly))return;
    const before=slideIndex;showSlide(index,true);if(!readOnly && before!==slideIndex)edited();
  }
  function apply(s) {
    data=s;readOnly=s.status!=="draft";showMissing=false;completionPaused=false;
    el("result").hidden=true;el("measures").replaceChildren();
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
  function showResult(saved) {
    if(saved.attempt_id!==id || saved.release_id!==data.release_id || saved.status!=="completed" || saved.result?.status!=="scored")throw new Error("INVALID_RESULT_ACK");
    el("measures").replaceChildren();for(const measure of saved.result.measures){
      const row=document.createElement("div");row.className="measure";const label=document.createElement("span"),value=document.createElement("strong");
      label.textContent=measure.label;value.textContent=measure.value+" / 12";row.append(label,value);el("measures").append(row);
    }
    el("result-kind").textContent="Сохранённый учебный результат";el("result-heading").textContent="Прохождение завершено";
    el("result-note").textContent="Все 30 ответов и результат сохранены. Расчёт выполнен по закреплённой версии, ключ 1.0.0. Проверен ключ, полная методическая инструкция ещё проверяется.";
    el("load-status").textContent="Результат восстановлен с сервера · "+saved.calculated_at;
    el("result").hidden=false;
  }
  async function loadSaved() {
    apply((await request("/api/participant/attempts/"+id+"/draft")).attempt);
    if(readOnly){try{showResult((await request("/api/participant/attempts/"+id+"/result")).completion);}
      catch(error){el("load-status").textContent="Протокол завершён, но результат сейчас не удалось загрузить. Повторите загрузку сохранённого состояния.";
        el("reload-draft").hidden=false;if(error.status===401)el("draft-login").hidden=false;}}
  }
  try {
    if(params.size!==1 || !id || !/^[0-9a-f-]{36}$/.test(id))throw new Error("INVALID_ATTEMPT");
    const session=await request("/api/auth/session");csrf=session.csrf_token;
    queue=PedPsyDraft.createQueue({onChange:renderStatus,save:async input=>{
      const {attempt}=await request("/api/participant/attempts/"+id+"/draft",{method:"PUT",headers:{"Content-Type":"application/json","X-CSRF-Token":csrf},body:JSON.stringify(input)});
      if(attempt.attempt_id!==id || attempt.release_id!==data.release_id)throw new Error("INVALID_SAVE_ACK");return attempt;
    }});
    await loadSaved();
  }catch(error){
    el("load-status").textContent=error.status===401?"Для этого прохождения нужен персональный вход.":"Черновик недоступен. Проверьте назначение или попробуйте позже.";
    el("save-status").textContent="Прохождение не загружено, запись не выполняется.";el("draft-login").hidden=false;return;
  }
  form.addEventListener("submit",async event=>{
    event.preventDefault();if(queue.state().blocked || finishing || completionPaused)return;
    if(!PedPsyForm.slideState(data.form.items,slideIndex).isLast){navigate(slideIndex+1);return;}
    showMissing=true;if(!summary().complete){el("errors").focus();return;}
    el("complete-dialog").showModal();
  });
  el("cancel-complete").addEventListener("click",()=>el("complete-dialog").close());
  el("confirm-complete").addEventListener("click",async()=>{
    el("complete-dialog").close();if(finishing || completionPaused || queue.state().blocked)return;
    finishing=true;renderStatus(queue.state());
    try{
      const state=await queue.flush();if(state.status!=="saved")return;
      const {completion}=await request("/api/participant/attempts/"+id+"/complete",{method:"POST",
        headers:{"Content-Type":"application/json","X-CSRF-Token":csrf},body:JSON.stringify({expected_revision:state.revision})});
      await loadSaved();if(!readOnly)throw new Error("INVALID_COMPLETION_STATE");showResult(completion);el("result").focus();
    }catch(error){completionPaused=true;if(error.status===401)el("draft-login").hidden=false;}
    finally{finishing=false;renderStatus(queue.state());}
  });
  el("previous").addEventListener("click",()=>navigate(slideIndex-1));el("next").addEventListener("click",()=>navigate(slideIndex+1));
  el("reset").addEventListener("click",()=>el("reset-dialog").showModal());
  el("cancel-reset").addEventListener("click",()=>el("reset-dialog").close());
  el("confirm-reset").addEventListener("click",()=>{
    el("reset-dialog").close();if(queue.state().blocked || finishing || completionPaused)return;
    for(const itemId of Object.keys(answers))delete answers[itemId];for(const field of fields.values())for(const input of field.querySelectorAll("input"))input.checked=false;
    showMissing=false;el("load-status").textContent="";showSlide(0,true);edited();
  });
  el("reload-draft").addEventListener("click",()=>el("reload-dialog").showModal());
  el("cancel-reload").addEventListener("click",()=>el("reload-dialog").close());
  el("confirm-reload").addEventListener("click",async()=>{
    el("reload-dialog").close();el("reload-draft").disabled=true;
    try{await loadSaved();}
    catch(error){el("save-status").textContent="Не удалось загрузить сохранённое состояние. Запись остаётся остановленной.";if(error.status===401)el("draft-login").hidden=false;}
    finally{el("reload-draft").disabled=false;}
  });
  window.addEventListener("beforeunload",event=>{if(queue.state().dirty){event.preventDefault();event.returnValue="";}});
})();
