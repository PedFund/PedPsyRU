"use strict";
(async()=>{
  const el=id=>document.getElementById(id);let csrf=null,offset=0,selected=null,epoch=0;
  const roles={administrator:"Администратор",superadministrator:"Суперадминистратор"};
  function signedOut(message){
    epoch++;csrf=null;selected=null;el("staff-account").hidden=true;el("staff-data").hidden=true;el("staff-detail").hidden=true;
    for(const id of ["staff-studies","staff-attempts","staff-answers"])el(id).replaceChildren();
    el("staff-heading").textContent="Вход администратора";el("staff-login").hidden=false;el("staff-status").textContent=message;
  }
  async function request(url,options={}) {
    const response=await fetch(url,{cache:"no-store",credentials:"same-origin",...options});
    if(!response.ok){
      if(response.status===401)signedOut("Вход истёк или доступ отозван. Войдите снова.");
      const error=new Error(response.status===401?"Не удалось подтвердить вход. Проверьте код и пароль или войдите снова.":response.status===413?"Выгрузка превышает лимит стенда. Скачайте отдельный протокол.":
        response.status===503?"Подготовьте тренировочную базу перед входом.":response.status===429?"Слишком много попыток. Повторите через 15 минут.":"Операция не выполнена. Проверьте доступ и повторите.");
      error.status=response.status;throw error;
    }
    return response;
  }
  async function page() {
    const stamp=epoch,data=await (await request("/api/admin/attempts?offset="+offset+"&limit=10")).json();
    if(stamp!==epoch)return;
    el("staff-attempts").replaceChildren();
    for(const a of data.attempts){
      const row=document.createElement("div");row.className="staff-row";
      const title=document.createElement("p");title.textContent=a.study_title+" · "+a.display_code+" · "+a.stage_code+" · "+a.group_name;
      const note=document.createElement("p");note.className="muted";note.textContent=(a.status==="draft"?"Не завершено":"Завершено")+" · Ответов: "+a.answer_count+" из 30";
      const button=document.createElement("button");button.type="button";button.className="secondary";button.textContent="Посмотреть ответы";
      button.addEventListener("click",()=>run(async()=>{
        const stamp=epoch,{attempt}=await (await request("/api/admin/attempts/"+a.attempt_id)).json();if(stamp!==epoch)return;
        selected=a.attempt_id;el("download-one").href="/api/admin/attempts/"+selected+"/answers.json";el("staff-detail-heading").textContent="Ответы · "+attempt.display_code+" · "+attempt.stage_code;
        el("staff-detail-info").textContent=attempt.study_title+" · "+attempt.answer_count+" из 30 · Пропущено: "+attempt.missing_item_ids.length+". Пропуски не заменяются нулями.";
        el("staff-answers").replaceChildren();
        for(const item of attempt.items){
          const li=document.createElement("li"),label=document.createElement("strong");label.textContent=item.value?"Выбрано "+item.value:"Нет ответа";li.append(label);
          for(const option of item.options){const p=document.createElement("p");p.textContent=option.value+". "+option.text;li.append(p);}
          el("staff-answers").append(li);
        }
        el("staff-detail").hidden=false;el("staff-detail").scrollIntoView({behavior:"smooth",block:"start"});
      }));
      row.append(title,note,button);el("staff-attempts").append(row);
    }
    el("staff-page-info").textContent=data.total?"Показаны "+(offset+1)+"–"+(offset+data.attempts.length)+" из "+data.total:"Протоколов пока нет.";
    el("staff-prev").disabled=offset===0;el("staff-next").disabled=offset+data.attempts.length>=data.total;
  }
  async function session() {
    const stamp=epoch,data=await (await request("/api/admin/auth/session")).json();if(stamp!==epoch)return;
    csrf=data.csrf_token;offset=0;
    const {studies}=await (await request("/api/admin/studies")).json();if(stamp!==epoch)return;
    el("staff-studies").replaceChildren();
    for(const s of studies){const li=document.createElement("li");li.textContent=s.title+" · Участников: "+s.participant_count+" · Протоколов: "+s.attempt_count+" · "+({active:"Активно",draft:"Черновик",closed:"Закрыто"}[s.status]);el("staff-studies").append(li);}
    await page();if(stamp!==epoch)return;
    el("staff-heading").textContent=roles[data.role];
    el("staff-role-note").textContent=data.role==="administrator"?"Менеджер исследователей. Обработка и изменение методик не входят в ваши права. Управление исследователями — следующий отдельный блок.":"Менеджер исследователей и методик. Управление исследователями и редактор методик добавим отдельными блоками.";
    el("staff-login").hidden=true;el("staff-account").hidden=false;el("staff-data").hidden=false;el("staff-status").textContent="Доступ ко всем исследованиям подтверждён.";
  }
  async function run(action){try{await action();}catch(error){el("staff-status").textContent=error.message||"Сервер недоступен.";}}
  el("staff-login").addEventListener("submit",event=>{
    event.preventDefault();el("staff-submit").disabled=true;
    run(async()=>{
      epoch++;try{await request("/api/admin/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({login_id:el("staff-code").value,password:el("staff-password").value})});}
      finally{el("staff-password").value="";}
      await session();
    }).finally(()=>{el("staff-submit").disabled=false;});
  });
  el("staff-logout").addEventListener("click",()=>{
    el("staff-logout").disabled=true;
    run(async()=>{await request("/api/admin/auth/logout",{method:"POST",headers:{"X-CSRF-Token":csrf}});signedOut("Вы вышли. Скачанные файлы остаются на вашем устройстве.");}).finally(()=>{el("staff-logout").disabled=false;});
  });
  el("staff-prev").addEventListener("click",()=>run(async()=>{offset=Math.max(0,offset-10);await page();}));
  el("staff-next").addEventListener("click",()=>run(async()=>{offset+=10;await page();}));
  // Native authenticated attachments, not blob URLs: browser handles file saving.
  for(const id of ["download-all","download-one"])el(id).addEventListener("click",()=>{el("staff-status").textContent="Скачивание запрошено. Проверьте загрузки браузера; сохраните файл в защищённом месте.";});
  try{await session();}catch(error){signedOut(error.status===401?"Введите персональный код и пароль.":error.message);}
})();
