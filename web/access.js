"use strict";
(async () => {
  const byId=id=>document.getElementById(id);
  let csrf=null;
  function signedOut(message){csrf=null;byId("access-account").hidden=true;byId("access-attempts").replaceChildren();byId("access-login").hidden=false;byId("access-status").textContent=message;}
  async function session(){
    const response=await fetch("/api/auth/session",{cache:"no-store",credentials:"same-origin"});
    if(!response.ok){signedOut(response.status===503?"Подготовьте тренировочную базу перед входом.":"Введите персональный код и пароль.");return;}
    const data=await response.json();csrf=data.csrf_token;
    const list=await fetch("/api/participant/attempts",{cache:"no-store",credentials:"same-origin"});
    if(!list.ok){signedOut("Вход истёк или доступ отозван. Войдите снова.");return;}
    const {attempts}=await list.json();
    byId("account-heading").textContent="Назначения · "+data.display_code;
    byId("access-attempts").replaceChildren();
    for(const attempt of attempts){const row=document.createElement("li");row.textContent=attempt.stage_code+" · "+attempt.group_name+" · "+(attempt.status==="draft"?"Не завершено":"Завершено")+" · ";
      const link=document.createElement("a");link.href="/take?attempt="+encodeURIComponent(attempt.attempt_id);link.textContent=attempt.status==="draft"?"Продолжить прохождение":"Посмотреть протокол";row.append(link);byId("access-attempts").append(row);}
    if(!attempts.length){const row=document.createElement("li");row.textContent="Доступных назначений нет.";byId("access-attempts").append(row);}
    byId("access-login").hidden=true;byId("access-account").hidden=false;byId("access-status").textContent="Вход выполнен. Откройте назначение: сохраняются подтверждённые сервером ответы и текущий слайд.";
  }
  byId("access-login").addEventListener("submit",async event=>{
    event.preventDefault();byId("login-button").disabled=true;
    try{
      const response=await fetch("/api/auth/login",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({login_id:byId("login-code").value,password:byId("login-password").value})});
      byId("login-password").value="";
      if(!response.ok){signedOut(response.status===429?"Слишком много попыток. Повторите через 15 минут.":"Не удалось войти. Проверьте код и пароль или обратитесь к владельцу стенда.");return;}
      await session();
    }catch{byId("login-password").value="";signedOut("Сервер недоступен. Попробуйте позже.");}
    finally{byId("login-button").disabled=false;}
  });
  byId("logout-button").addEventListener("click",async()=>{
    byId("logout-button").disabled=true;
    try{
      const response=await fetch("/api/auth/logout",{method:"POST",credentials:"same-origin",headers:{"X-CSRF-Token":csrf}});
      if(response.ok||response.status===401)signedOut("Вы вышли из своей записи.");
      else byId("access-status").textContent="Выход не подтверждён сервером. Обновите страницу и повторите.";
    }catch{byId("access-status").textContent="Выход не подтверждён: сервер недоступен.";}
    finally{byId("logout-button").disabled=false;}
  });
  try{await session();}catch{signedOut("Не удалось связаться с локальным сервером.");}
})();
