"use strict";
(() => {
  const uuid=v=>typeof v==="string"&&/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(v);
  const ownsPage=hash=>/^#(?:join=|study=|participant(?:$|=))/.test(hash);
  function entry(hash){if(hash==="#participant")return {kind:"participant"};if(/^#join=[A-Za-z0-9_-]{43}$/.test(hash))return {kind:"join",invite:hash.slice(6)};if(hash.startsWith("#study=")&&uuid(hash.slice(7)))return {kind:"study",study:hash.slice(7)};throw Error("Некорректная ссылка. Откройте приглашение исследователя заново.");}
  const escape=v=>String(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const resultApi=typeof module==="object"&&module.exports?require("./result-presenter.js"):(typeof window!=="undefined"?window.PedPsyResult:null);
  function fieldValue(field,raw){if(typeof raw!=="string")throw Error("Проверьте поле паспортички.");const v=raw.trim();if(!v){if(field.required)throw Error("Заполните обязательное поле: "+field.label);return undefined;}
    if(field.kind==="integer"){if(!/^-?\d+$/.test(v))throw Error("Введите целое число.");const n=Number(v);if(!Number.isSafeInteger(n)||n<field.min||n>field.max)throw Error("Число вне допустимого диапазона.");return n;}
    if(field.kind==="single_choice"){if(!field.options.some(o=>o.value===v))throw Error("Выберите вариант из списка.");return v;}
    if(field.kind!=="text"||Array.from(v).length>field.max_length||/[\u0000-\u001f\u007f]/.test(v))throw Error("Проверьте текст поля.");return v;
  }
  function question(form,draft){const index=form.items.findIndex(i=>i.id===draft.current_item_id);if(index<0)throw Error("Текущий вопрос не найден. Перечитайте прохождение.");return {item:form.items[index],index,total:form.items.length};}
  function draftChoice(draft,item,value,next,allowed=["A","B"]){if(!allowed.includes(value))throw Error("Выберите один вариант.");return {expected_revision:draft.revision,current_item_id:next,responses:[...draft.responses.filter(r=>r.item_id!==item).map(r=>({item_id:r.item_id,value:r.value})),{item_id:item,value}]};}
  function groupLink(origin,token){if(!/^[A-Za-z0-9_-]{43}$/.test(token))throw Error("Недействительное приглашение.");return new URL("/workspace#join="+token,origin).href;}
  function scaleClass(colors){const n=Math.max(2,Math.min(5,Number(colors)||2));return "scale-"+n;}
  function categoricalMarkup(colors,index,label,count){
    return '<div class="result-categorical '+scaleClass(colors)+'" role="img" aria-label="Уровень: '+escape(label)+'">'+Array.from({length:count||colors||4},(_,i)=>'<span class="result-segment tone-'+(i+1)+(i===index?' active':'')+'"></span>').join("")+'</div>';
  }
  function barMarkup(measure){
    if(measure.level&&Number.isInteger(measure.level_index)&&measure.level_index>=0)return categoricalMarkup(measure.colors,measure.level_index,measure.level,measure.colors);
    const min=Number(measure.min),max=Number(measure.max),value=Number(measure.value);
    const valid=Number.isFinite(min)&&Number.isFinite(max)&&max>min&&Number.isFinite(value);
    const percent=valid?Math.max(4,Math.min(96,(value-min)/(max-min)*100)):50;
    const label=measure.level?"Уровень: "+measure.level:"Результат по шкале";
    return '<div class="result-scale '+scaleClass(measure.colors)+'" role="img" aria-label="'+escape(label)+'"><span class="result-marker" style="left:'+percent.toFixed(2)+'%"></span></div><div class="result-scale-ends"><span>ниже</span><span>выше</span></div>';
  }
  function measureMarkup(measure,compact){
    const level=measure.level?'<span class="result-level">'+escape(measure.level)+'</span>':"";
    const raw=Number(measure.value),valueText=Number.isFinite(raw)?String(Math.round(raw*10)/10):"";
    const value=valueText?'<span class="result-measure-value">'+escape(valueText)+'</span>':"";
    const description=measure.description?'<p class="result-description">'+escape(measure.description)+'</p>':"";
    const levelText=!compact&&measure.level_text?'<p class="result-level-text">'+escape(measure.level_text)+'</p>':"";
    return '<div class="result-measure"><div class="result-measure-head"><span class="result-measure-label">'+escape(measure.label)+'</span><span class="result-measure-right">'+value+level+'</span></div>'+barMarkup(measure)+description+levelText+'</div>';
  }
  function summaryMarkup(summary){
    if(!summary)return "";
    const separate=Boolean(summary.level&&summary.level.code&&!(summary.measures||[]).some(m=>m.code===summary.level.code));
    const level=separate&&summary.level&&summary.level.value?'<span class="result-level">'+escape(summary.level.value)+'</span>':"";
    const levelText=separate&&summary.level&&summary.level.text?'<p class="result-level-text">'+escape(summary.level.text)+'</p>':"";
    const categorical=separate&&summary.level.index>=0?categoricalMarkup(summary.colors,summary.level.index,summary.level.value,summary.level.count||summary.colors||4):"";
    return '<section class="result-summary"><h3>'+escape(summary.title)+'</h3>'+categorical+level+levelText+(summary.measures||[]).map(m=>measureMarkup(m,separate)).join("")+'</section>';
  }
  function resultMarkup(presentation){
    if(resultApi&&resultApi.supports(presentation))return resultApi.markup(presentation);
    const groups=(presentation.groups||[]).map(group=>'<section class="result-group"><h3>'+escape(group.title)+'</h3>'+(group.description?'<p class="result-description">'+escape(group.description)+'</p>':"")+(group.measures||[]).map(m=>measureMarkup(m,false)).join("")+'</section>').join("");
    const summary=summaryMarkup(presentation.summary),after=presentation.summary_position==="bottom";
    const hasLevels=Boolean(presentation.summary&&presentation.summary.level)||(presentation.groups||[]).some(group=>(group.measures||[]).some(measure=>measure.level));
    const note=presentation.note||(hasLevels?"Уровень определяется как положение балла относительно количественных границ ключа. Не является психологическим диагнозом.":"");
    return '<section class="card result-card palette-'+(presentation.palette==="negative"?"negative":"positive")+'"><div class="result-toolbar"><button id="result-methods" class="result-back" type="button" aria-label="К методикам">К методикам</button></div><p class="result-eyebrow">Ваш результат</p><h2>'+escape(cleanTitle(presentation.title))+'</h2>'+(presentation.item_count?'<p class="result-meta">'+presentation.item_count+' '+(presentation.item_unit||"пунктов")+'</p>':"")+'<p class="muted result-disclaimer">Спасибо за участие в исследовании! Этот результат носит ориентировочный характер и получен в рамках исследования. Он не является диагнозом.</p>'+(note?'<p class="muted result-level-note">'+escape(note)+'</p>':"")+(after?groups+summary:summary+groups)+'</section>';
  }
  const model={ownsPage,entry,escape,fieldValue,question,draftChoice,groupLink,resultMarkup};
  if(typeof module==="object"&&module.exports){module.exports=model;return;}
  window.PedPsyParticipant=model;
  if(!ownsPage(location.hash))return;
  window.pedpsyParticipantPage=true;
  const $=id=>document.getElementById(id),root=$("participant-screen");
  for(const id of ["login-screen","mfa-screen","recovery-screen","workspace-screen"])$(id).hidden=true;
  root.hidden=false;$("heading").textContent="Участие в исследовании";$("identity").textContent="Участник";const stageLabel=document.querySelector("aside .stage");if(stageLabel)stageLabel.textContent="Кабинет участника";document.title="Апробация: тесты (альфа-тестирование) — участие в исследовании";
  let invite="",study="",pendingCsrf="",delivery="synthetic",csrf="",context=null,passport=null,consents=null,stages=null,form=null,draft=null,attempt="",activeStageId="",profileIndex=0,profileValues={},locked=false,busy=false;
  const errors={EMAIL_ALREADY_REGISTERED:"Этот email уже зарегистрирован. Войдите с паролем или восстановите его.",RESEND_THROTTLED:"Слишком часто. Подождите минуту и попробуйте снова.",AMBIGUOUS_PARTICIPANT_STUDY:"Этот адрес найден в нескольких исследованиях. Откройте групповую ссылку нужного исследования и войдите по ней.",LOGIN_LOCKED:"Вход временно заблокирован после серии неудачных попыток. Повторите позже или обратитесь к исследователю.",WEAK_PASSWORD:"Пароль слишком простой: не используйте распространённые пароли и свой email. Придумайте пароль от 12 символов.",AUTH_REQUIRED:"Сессия завершена. Войдите снова.",REGISTRATION_NOT_CONFIGURED:"Учебная регистрация на этом стенде не подключена.",DATABASE_NOT_CONFIGURED:"Это просмотр интерфейса без базы данных.",INVALID_LOGIN:"Проверьте email и пароль.",INVALID_REGISTRATION_INPUT:"Проверьте поля. В учебном контуре используйте email @example.test и пароль от 12 символов.",INVALID_CONFIRMATION:"Подтверждение не принято. Откройте исходную групповую ссылку и запросите учебное письмо снова.",PARTICIPATION_REQUIREMENTS_CHANGED:"Условия изменились. Перечитайте данные и примите актуальные обязательные условия.",PASSPORT_CONFLICT:"Паспортичка изменена. Перечитайте её перед новой записью.",REVISION_CONFLICT:"Ответы изменены. Перечитайте прохождение перед новой записью.",NOT_AVAILABLE:"Доступ недоступен. Обратитесь к исследователю.",STORAGE_BUSY:"Сервер занят. Перечитайте состояние перед повтором.",INTERNAL_ERROR:"Ответ сервера не подтверждён. Перечитайте состояние; автоматического повтора нет.",ADMISSION_NOT_CONFIGURED:"Допуск к этапам на этом стенде не подключён."};
  function inviteCookie(){const m=document.cookie.match(/(?:^|; )pedpsy_invite=([A-Za-z0-9_-]{43})(?:;|$)/);return m?m[1]:"";}
  function setInviteCookie(v){document.cookie="pedpsy_invite="+v+"; Path=/; SameSite=Strict; Max-Age=3600";}
  function clearInviteCookie(){document.cookie="pedpsy_invite=; Path=/; SameSite=Strict; Max-Age=0";}
  function status(text,error=false){$("message").textContent=text;$("message").className=error?"error":"";}
  function showDocument(title,text){const dialog=$("participant-document-dialog"),body=$("participant-document-body");$("participant-document-title").textContent=title;body.replaceChildren(...documentParagraphs(text));if(!dialog.open)dialog.showModal();}
  function documentParagraphs(text){const headings=["Общие положения","Цели обработки персональных данных","Состав обрабатываемых данных","Порядок обработки персональных данных","Конфиденциальность и защита данных","Срок обработки и отзыв согласия","Подтверждение согласия","Содержание участия","Добровольность участия","Возможные риски и ограничения","Конфиденциальность и использование результатов","Цели обработки","Условия обработки","Права участника"];const normalized=String(text||"").replace(/\s+/g," ").trim();const headingPattern=new RegExp("("+[...headings].sort((a,b)=>b.length-a.length).map(value=>value.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")).join("|")+")","g");let marked=normalized.replace(headingPattern,"\n$1\n");for(const lead of ["МетодТест-Платформа","Настоящее согласие","Я добровольно","Подтверждая согласие"])marked=marked.split(lead).join("\n"+lead+"\n");const out=[];for(const block of marked.split("\n").map(value=>value.trim()).filter(Boolean)){const heading=headings.includes(block);if(heading){out.push({text:block,heading:true});continue;}for(const sentence of block.split(/(?<=[.!?])\s+(?=[А-ЯЁA-Z])/).map(value=>value.trim()).filter(Boolean))out.push({text:sentence,heading:false});}return out.length?out.map(({text,heading})=>{const p=document.createElement("p");if(heading)p.className="document-heading";p.textContent=text;return p;}):[document.createTextNode("Текст документа недоступен.")];}
  function askConfirm(text){const dialog=$("participant-confirm-dialog");$("participant-confirm-text").textContent=text;return new Promise(resolve=>{const buttons=[...dialog.querySelectorAll("button")];let settled=false;const finish=value=>{if(settled)return;settled=true;dialog.removeEventListener("close",onClose);dialog.removeEventListener("cancel",onCancel);for(const b of buttons)b.onclick=null;resolve(value==="ok");};const onClose=()=>finish(dialog.returnValue),onCancel=()=>finish("cancel");if(dialog.open)dialog.close();dialog.returnValue="";for(const b of buttons){b.onclick=()=>{const value=b.value;finish(value);if(dialog.open)dialog.close(value);};b.disabled=false;}dialog.addEventListener("close",onClose);dialog.addEventListener("cancel",onCancel);dialog.showModal();});}
  async function request(path,body,method,registration=false){const response=await fetch("/api/v2/"+path,{method:method||(body===undefined?"GET":"POST"),credentials:"same-origin",cache:"no-store",headers:{...(body===undefined?{}:{"Content-Type":"application/json"}),"x-pedpsy-csrf":registration?pendingCsrf:csrf,...(registration&&invite?{"x-pedpsy-invite":invite}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});const data=await response.json();if(!response.ok){const e=new Error(errors[data.error]||"Операция не выполнена. Перечитайте состояние перед повтором.");e.code=data.error;throw e;}return data;}
  async function recoverAfterError(error){if(!["STORAGE_BUSY","INTERNAL_ERROR","PASSPORT_CONFLICT","REVISION_CONFLICT","PARTICIPATION_REQUIREMENTS_CHANGED"].includes(error.code))return false;try{const fresh=await request("participant/profile");passport=fresh;profileValues={...fresh.values,...profileValues};locked=false;if(document.getElementById("passport-field-form"))renderPassport();status("Состояние обновлено. Введённые значения сохранены на экране — проверьте их и сохраните снова.");return true;}catch{return false;}}
  async function run(fn){if(busy)return;busy=true;for(const b of root.querySelectorAll("button"))b.disabled=true;try{status("");await fn();}catch(e){const recovered=await recoverAfterError(e);if(!recovered&&["REVISION_CONFLICT","PASSPORT_CONFLICT","PARTICIPATION_REQUIREMENTS_CHANGED","STORAGE_BUSY","INTERNAL_ERROR"].includes(e.code))locked=true;if(e.code==="AUTH_REQUIRED"){csrf="";form=null;draft=null;attempt="";renderLogin();}status(recovered?"Состояние перечитано; проверьте значения и повторите сохранение.":e.message,true);}finally{busy=false;for(const b of root.querySelectorAll("button"))b.disabled=b.dataset.blocked==="true";}}
  const bind=(id,fn)=>{$(id)?.addEventListener("click",()=>run(fn));};
  const blocked=(id,yes)=>{const b=$(id);if(b){b.dataset.blocked=String(Boolean(yes));b.disabled=Boolean(yes);}};
  async function preflight(){const p=await request("registration/preflight",undefined,undefined,true);pendingCsrf=p.csrf;delivery=p.delivery==="email"?"email":"synthetic";}
  function entryTab(mode){const register=mode==="register",r=$("entry-tab-register"),l=$("entry-tab-login");if(r){r.className="entry-tab"+(register?" active":"");r.setAttribute("aria-selected",String(register));}if(l){l.className="entry-tab"+(register?"":" active");l.setAttribute("aria-selected",String(!register));}const panel=$("entry-register-panel"),login=$("participant-login-form");if(panel)panel.hidden=!register;if(login)login.hidden=register;}
  function renderLogin(){root.innerHTML='<section class="card narrow"><h2 id="join-title">Вход участника</h2><p id="join-group" class="muted"></p><div class="entry-tabs" id="entry-tabs" role="tablist"><button type="button" id="entry-tab-register" class="entry-tab" role="tab" aria-selected="true">Первый раз — регистрация</button><button type="button" id="entry-tab-login" class="entry-tab" role="tab" aria-selected="false">Уже есть аккаунт — вход</button></div><p id="entry-register-hint" class="muted" hidden></p><div id="registration-box" hidden></div><form id="participant-login-form" hidden><label>Email (логин)<input id="participant-email" type="email" autocomplete="email" required maxlength="254"></label><label>Пароль<input id="participant-password" type="password" autocomplete="current-password" required minlength="12" maxlength="256"></label><button id="participant-signin" type="submit">Войти</button></form><p id="participant-link-help" class="muted"></p></section>';
    if(context){$("join-title").textContent=context.study_title;$("join-group").textContent=context.group_name;$("registration-box").hidden=false;
      $("registration-box").innerHTML='<div id="entry-register-panel"><form id="participant-register-form"><label>Email (логин)<input id="registration-email" type="email" autocomplete="email" placeholder="you@example.com" required maxlength="254"></label><label>Пароль<input id="registration-password" type="password" autocomplete="new-password" required minlength="12" maxlength="256" placeholder="Не менее 12 символов"></label><p class="field-hint">Пароль — не менее 12 символов.</p><p class="muted">Почта должна быть реальной: при потере пароля доступ восстанавливается только через неё.</p><button id="open-contact-document" type="button" class="text">Открыть согласие на обработку персональных данных</button><label class="check-label"><input id="contact-approval" type="checkbox" required>Согласен/согласна на обработку персональных данных</label><button type="submit">Зарегистрироваться</button></form><details id="resume-code" hidden><summary>Уже получили код из письма?</summary><label>Код из письма<input id="resume-code-value" type="text" autocomplete="one-time-code" maxlength="64" placeholder="Вставьте код из письма"></label><button id="resume-code-confirm" type="button">Подтвердить код</button></details><div id="confirmation-box" hidden><p id="confirmation-hint"></p><div id="synthetic-receipt-box"><button id="show-receipt" class="secondary" type="button">Показать учебное письмо</button><code id="receipt-token" hidden></code><button id="confirm-contact" type="button" hidden>Подтвердить email</button></div><div id="email-code-box" hidden><label>Код из письма<input id="email-confirmation-code" type="text" autocomplete="one-time-code" maxlength="64" placeholder="Вставьте код из письма"></label><button id="confirm-email-code" type="button">Подтвердить код</button><div class="muted">Не пришло письмо? <button id="resend-code" class="secondary" type="button">Отправить код ещё раз</button> <span id="resend-hint" class="muted"></span></div></div></div></div>';$("open-contact-document").onclick=()=>showDocument("Согласие на обработку персональных данных",context.contact_notice.text);


      $("synthetic-receipt-box").hidden=delivery==="email";$("email-code-box").hidden=delivery!=="email";
      $("entry-tab-register").onclick=()=>entryTab("register");$("entry-tab-login").onclick=()=>entryTab("login");
      entryTab("register");
      $("participant-register-form").addEventListener("submit",e=>{e.preventDefault();const email=$("registration-email").value.trim(),password=$("registration-password").value;run(async()=>{if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))throw Error("Проверьте адрес почты.");if(password.length<12)throw Error("Пароль — от 12 символов.");if(!$("contact-approval").checked)throw Error("Примите условия обработки контакта.");await request("registration/direct",{email,password,contact_notice_version:context.contact_notice.version,accept_contact_notice:true},undefined,true);await preflight();await request("registration/login",{study_id:study,email,password},undefined,true);invite="";sessionStorage.removeItem("pedpsy_invite");clearInviteCookie();await reload();status("Аккаунт создан. Вы вошли.");});});
      function afterConfirm(code,email){
        $("receipt-token").textContent="";proof="";
        $("confirmation-box").innerHTML='<p>Код подтверждён. Придумайте пароль для входа.</p><label>Новый пароль<input id="new-password" type="password" autocomplete="new-password" minlength="12" maxlength="256" placeholder="Не менее 12 символов"></label><button id="save-password" type="button">Сохранить пароль</button>';
        $("confirmation-box").hidden=false;
        bind("save-password",async()=>{
          const password=$("new-password").value;
          if(password.length<12)throw Error("Пароль — от 12 символов.");
          await request("registration/password",{confirmation_token:code,password},undefined,true);
          $("new-password").value="";$("participant-email").value=email;$("confirmation-box").hidden=true;
          status("Пароль сохранён. Войдите с ним.");entryTab("login");
        });
      }
      let proof="";bind("show-receipt",async()=>{const r=await request("registration/receipt",{},undefined,true);proof=r.confirmation_token;$("receipt-token").textContent=proof;$("receipt-token").hidden=false;$("confirm-contact").hidden=false;});bind("confirm-contact",async()=>{if(!proof)throw Error("Сначала получите учебное подтверждение.");await request("registration/confirm",{confirmation_token:proof},undefined,true);afterConfirm(proof,$("registration-email").value.trim());});bind("confirm-email-code",async()=>{const code=$("email-confirmation-code").value.trim();if(!/^[A-Za-z0-9_-]{20,80}$/.test(code))throw Error("Введите код из письма.");await request("registration/confirm",{confirmation_token:code},undefined,true);$("email-confirmation-code").value="";afterConfirm(code,$("registration-email").value.trim());});bind("resume-code-confirm",async()=>{const code=$("resume-code-value").value.trim();if(!/^[A-Za-z0-9_-]{20,80}$/.test(code))throw Error("Введите код из письма.");await request("registration/confirm",{confirmation_token:code},undefined,true);$("resume-code-value").value="";afterConfirm(code,$("registration-email").value.trim());});bind("resend-code",async()=>{const email=$("registration-email").value.trim();if(!email)throw Error("Сначала укажите адрес почты.");await request("registration/resend",{email},undefined,true);const until=Date.now()+60000;const button=$("resend-code");button.disabled=true;const tick=()=>{const left=Math.ceil((until-Date.now())/1000);$("resend-hint").textContent=left>0?("Повторно можно через "+left+" с."):"";if(left>0)setTimeout(tick,1000);else{button.disabled=false;$("resend-hint").textContent="";}};$("resend-hint").textContent="Письмо отправлено ещё раз.";tick();});
    } else {
      $("registration-box").hidden=true;$("entry-tabs").hidden=true;$("entry-register-hint").hidden=false;$("entry-register-hint").textContent="Регистрация возможна только по групповой ссылке исследователя: откройте её из письма или кабинета исследователя. Если вы уже регистрировались, войдите по email и паролю ниже.";entryTab("login");
    }
    $("participant-link-help").textContent=study?"":"Можно войти по email: если адрес встречается в одном исследовании, сервер определит его сам. Если в нескольких — откройте групповую ссылку.";
    $("participant-login-form").addEventListener("submit",e=>{e.preventDefault();const email=$("participant-email").value,password=$("participant-password").value;run(async()=>{await preflight();const body=study?{study_id:study,email,password}:{email,password};const s=await request("registration/login",body,undefined,true);csrf=s.csrf;$("participant-password").value="";invite="";sessionStorage.removeItem("pedpsy_invite");clearInviteCookie();context=null;await reload();});});
    const resetBox=document.createElement("details");resetBox.id="password-reset";
    resetBox.innerHTML='<summary>Забыли пароль?</summary><p class="muted">Пришлём код на почту, указанную при регистрации.</p><button id="reset-request" type="button">Получить код</button><div id="reset-form" hidden><label>Код из письма<input id="reset-code" type="text" autocomplete="one-time-code" maxlength="64"></label><label>Новый пароль<input id="reset-password" type="password" autocomplete="new-password" minlength="12" maxlength="256"></label><button id="reset-submit" type="button">Сменить пароль</button></div>';
    $("participant-login-form").after(resetBox);
    bind("reset-request",async()=>{const email=$("participant-email").value.trim();if(!email)throw Error("Сначала укажите email.");await preflight();await request("registration/password/forgot",{email},undefined,true);$("reset-form").hidden=false;status("Если адрес зарегистрирован, код отправлен на почту.");});
    bind("reset-submit",async()=>{const email=$("participant-email").value.trim(),code=$("reset-code").value.trim(),password=$("reset-password").value;if(!/^[A-Za-z0-9_-]{20,80}$/.test(code))throw Error("Введите код из письма.");if(password.length<12)throw Error("Пароль — от 12 символов.");await preflight();await request("registration/password/reset",{email,code,password},undefined,true);$("reset-code").value="";$("reset-password").value="";status("Пароль изменён. Войдите с новым паролем.");});
  }  function showParticipantToolbar(){const t=$("participant-toolbar");if(t)t.hidden=false;}
  function hideParticipantToolbar(){const t=$("participant-toolbar");if(t)t.hidden=true;}
  function shell(){root.innerHTML='<div class="participant-session-bar" id="participant-toolbar"><button id="participant-logout" class="participant-logout" type="button">Выйти</button></div><div id="participant-content"></div>';bind("participant-logout",async()=>{await request("participant/logout",{});csrf="";form=null;draft=null;attempt="";profileValues={};renderLogin();status("Вы вышли. Ответы сохранены на сервере.");});}
  async function reload(){const s=await request("participant/session");csrf=s.csrf;passport=await request("participant/profile");consents=await request("participant/consents");stages=await request("participant/stages");study=stages.study_id;history.replaceState(null,"","/workspace#study="+study);locked=false;form=null;draft=null;attempt="";profileValues={...passport.values};profileIndex=Math.max(0,passport.fields.findIndex(f=>f.required&&!Object.hasOwn(profileValues,f.key)));shell();renderOverview();}
  function renderOverview(){
    const c=$("participant-content");
    c.innerHTML='<section class="card participant-stages-card"><h2>Доступные этапы исследования</h2><p class="muted">Выберите этап, чтобы перейти к его методикам.</p><div id="participant-stage-list" class="participant-stage-list"></div></section>'+
      '<section class="card participant-card" id="participant-requirements"><h2>Сведения и согласия</h2><div class="row participant-status-row"><div><strong>Сведения об участнике</strong><small id="passport-state" class="participant-status"></small></div><button id="open-passport" class="secondary" type="button">Открыть сведения</button></div><div class="row participant-status-row"><div><strong>Согласия</strong><small id="consent-state" class="participant-status"></small></div><button id="open-consents" class="secondary" type="button">Открыть документы</button></div></section>';
    const needsAction=!stages.passport_completed||!stages.required_consents_accepted;
    $("participant-requirements").classList.toggle("is-action-required",needsAction);
    const passportState=$("passport-state"),consentState=$("consent-state");
    passportState.textContent=stages.passport_completed?"Заполнены":"Требуется заполнение";
    passportState.classList.toggle("is-action",!stages.passport_completed);
    consentState.textContent=stages.required_consents_accepted?"Приняты":"Требуется согласие";
    consentState.classList.toggle("is-action",!stages.required_consents_accepted);
    bind("open-passport",renderPassport);bind("open-consents",renderConsents);
    const list=$("participant-stage-list");
    if(!stages.stages.length){const empty=document.createElement("p");empty.className="muted";empty.textContent="Исследователь ещё не открыл этап для вашей группы, либо доступ к нему прекращён.";list.append(empty);return;}
    for(const s of stages.stages){
      const item=document.createElement("div");item.className="participant-stage";
      const text=document.createElement("div");text.className="participant-stage-text";
      const name=document.createElement("strong");name.className="participant-stage-name";name.textContent=s.display_name||s.code;text.append(name);
      if(s.display_name){const code=document.createElement("small");code.className="participant-stage-code";code.textContent=s.code;text.append(code);}
      const button=document.createElement("button");button.type="button";button.className="participant-stage-action";button.textContent="К методикам";
      button.dataset.blocked=String(!stages.passport_completed||!stages.required_consents_accepted);
      button.disabled=button.dataset.blocked==="true";
      button.addEventListener("click",()=>run(()=>openStage(s)));
      item.append(text,button);list.append(item);
    }
  }
  function renderPassport(){const c=$("participant-content");if(passport.status==="completed"){c.innerHTML='<section class="card"><h2>Сведения подтверждены</h2><p class="muted">Вы можете обновить сведения по своему желанию. Прежняя версия сохранится вместе с уже пройденными тестами.</p><div id="passport-summary"></div><button id="passport-update" type="button">Обновить сведения</button><button id="passport-back" class="secondary">← Назад</button></section>';for(const f of passport.fields){if(!Object.hasOwn(passport.values,f.key))continue;const p=document.createElement("p");p.textContent=f.label+": "+(f.kind==="single_choice"?f.options.find(o=>o.value===passport.values[f.key])?.label:passport.values[f.key]);$("passport-summary").append(p);}bind("passport-update",async()=>{if(!(await askConfirm("Заполнить новую версию сведений? Прежняя версия и ответы на тесты сохранятся.")))return;passport=await request("participant/profile/restart",{schema_version:passport.schema_version,expected_revision:passport.revision});profileValues={...passport.values};profileIndex=0;renderPassport();});bind("passport-back",renderOverview);return;}
    if(!passport.fields.length){c.innerHTML='<section class="card narrow"><h2>Сведения об участнике</h2><p class="muted">Исследователь не запрашивает дополнительные сведения.</p><button id="profile-complete-empty" type="button">Подтвердить и продолжить</button><button id="profile-overview" class="text">← Назад</button></section>';bind("profile-overview",renderOverview);bind("profile-complete-empty",async()=>{await request("participant/profile/complete",{schema_version:passport.schema_version,expected_revision:passport.revision});await reload();status("Сведения подтверждены.");});return;}
    const field=passport.fields[profileIndex];c.innerHTML='<section class="card narrow"><h2>Паспортичка</h2><p id="profile-progress" class="muted"></p><form id="passport-field-form"><label id="profile-label"></label><div id="profile-input-box"></div><div class="toolbar"><button id="profile-prev" type="button" class="secondary">Назад</button><button id="profile-next" type="submit">Сохранить и далее</button><button id="profile-complete" type="button" hidden>Подтвердить паспортичку</button></div></form><button id="profile-overview" class="text">← Назад</button></section>';
    $("profile-progress").textContent="Поле "+(profileIndex+1)+" из "+passport.fields.length;$("profile-label").textContent=field.label+(field.required?" *":" (необязательно)");let input=document.createElement(field.kind==="single_choice"?"select":"input");input.id="profile-value";input.required=field.required;
    if(field.kind==="single_choice"){const empty=document.createElement("option");empty.value="";empty.textContent="Выберите вариант";input.append(empty);for(const o of field.options){const option=document.createElement("option");option.value=o.value;option.textContent=o.label;input.append(option);}}else if(field.kind==="integer"){input.type="number";input.min=field.min;input.max=field.max;input.step="1";if(field.key==="age")input.inputMode="numeric";}else{input.type="text";input.maxLength=field.max_length;}input.value=profileValues[field.key]??"";$("profile-input-box").append(input);$("profile-label").htmlFor=input.id;
    blocked("profile-prev",profileIndex===0||locked);blocked("profile-next",locked);$("profile-next").textContent=profileIndex===passport.fields.length-1?"Сохранить поле":"Сохранить и далее";$("profile-complete").hidden=profileIndex!==passport.fields.length-1;blocked("profile-complete",locked);
    async function save(){const value=fieldValue(field,input.value);if(value===undefined)delete profileValues[field.key];else profileValues[field.key]=value;passport=await request("participant/profile/save",{schema_version:passport.schema_version,expected_revision:passport.revision,values:profileValues});profileValues={...passport.values};}
    $("passport-field-form").addEventListener("submit",e=>{e.preventDefault();run(async()=>{if(locked)throw Error("Перечитайте состояние перед записью.");await save();if(profileIndex<passport.fields.length-1)profileIndex++;renderPassport();status("Поле сохранено.");});});bind("profile-prev",async()=>{profileIndex--;renderPassport();});bind("profile-overview",renderOverview);bind("profile-complete",async()=>{if(locked)throw Error("Перечитайте состояние.");await save();await request("participant/profile/complete",{schema_version:passport.schema_version,expected_revision:passport.revision});await reload();status("Паспортичка подтверждена.");});
  }
  function renderConsents(){const c=$("participant-content");c.innerHTML='<section class="card"><h2>Документы и согласия</h2><p class="muted">Документы предоставлены оператором исследования. Дополнительное научное использование добровольно; обращения к оператору рассматриваются отдельно.</p><div id="consent-documents"></div><button id="consents-back" class="secondary">← Назад</button></section>';for(const d of consents.documents){const card=document.createElement("section");card.className="consent-document";const title=document.createElement("h3");title.textContent=({contact_processing:"Обработка контакта",study_participation:"Участие в исследовании",secondary_research:"Дополнительное научное использование"})[d.purpose]+(d.required?" · обязательно":" · добровольно");const version=document.createElement("p");version.className="muted";version.textContent="Версия: "+d.version;const open=document.createElement("button");open.type="button";open.className="text";open.textContent="Открыть текст согласия";open.onclick=()=>showDocument(title.textContent,d.text);card.append(title,version,open);
      if(d.accepted_at_ms!==null){const accepted=document.createElement("p");accepted.textContent="Принято: "+new Date(d.accepted_at_ms).toLocaleString("ru-RU");card.append(accepted);}else if(d.purpose!=="contact_processing"){const label=document.createElement("label");label.className="check-label";const check=document.createElement("input");check.type="checkbox";check.dataset.consent=d.purpose;label.append(check,document.createTextNode("Я прочитал/прочитала и согласен/согласна"));const button=document.createElement("button");button.type="button";button.className="consent-accept";button.textContent="Подтвердить согласие";button.dataset.blocked="true";button.disabled=true;check.onchange=()=>{button.dataset.blocked=String(!check.checked||locked);button.disabled=!check.checked||locked;};button.onclick=()=>run(async()=>{if(!check.checked||locked)throw Error("Подтвердите выбор или перечитайте условия.");consents=await request("participant/consents/accept",{purpose:d.purpose,document_version:d.version,expected_policy_revision:consents.policy_revision,accept:true});stages=await request("participant/stages");renderConsents();status("Принята выбранная версия. Другие согласия не изменены.");});card.append(label,button);}$("consent-documents").append(card);}bind("consents-back",renderOverview);}
  async function readRetry(path,attempt=0){try{return await request(path);}catch(e){if(e.code!=="STORAGE_BUSY"||attempt>=1)throw e;await new Promise(r=>setTimeout(r,700));return readRetry(path,attempt+1);}}async function openStage(stage){if(locked)throw Error("Перечитайте состояние перед допуском.");activeStageId=stage.stage_id;const a=await request("participant/stages/enroll",{stage_id:stage.stage_id,expected_opening_revision:stage.opening_revision,expected_passport_schema_version:stages.passport_schema_version,expected_consent_policy_revision:consents.policy_revision});$("participant-content").innerHTML='<section class="card"><button id="methods-back" class="back-button" aria-label="Назад к этапам" title="Назад">← Назад</button><h2 id="selected-stage"></h2><div id="stage-methods"></div></section>';locked=false;$("selected-stage").textContent="Этап "+stage.code;const methodForms=await Promise.all(a.attempts.map(item=>readRetry("participant/attempts/"+item.attempt_id+"/form")));for(const [formIndex,item] of a.attempts.entries()){const row=document.createElement("div");row.className="row";const text=document.createElement("div");const methodForm=methodForms[formIndex];const measurement=methodForm.presentation&&methodForm.presentation.id==="pedpsy/breath-hold";const count=(methodForm.items||[]).length;const title=document.createElement("strong");title.textContent=cleanTitle(methodForm.title||"Томас—Килманн");const meta=document.createElement("small");meta.className="row-meta";meta.textContent=(measurement?"измерение":count+" пунктов")+" · "+(item.status==="completed"?"завершено":"ожидает заполнения");text.append(title,meta);const button=document.createElement("button");button.textContent=item.status==="completed"?"Мой результат":"Заполнить";button.onclick=()=>run(()=>openAttempt(item));row.append(text,button);$("stage-methods").append(row);}bind("methods-back",renderOverview);}
  async function openAttempt(item){showParticipantToolbar();attempt=item.attempt_id;if(item.status==="completed"){renderResult(await request("participant/attempts/"+attempt+"/result"));return;}form=await readRetry("participant/attempts/"+attempt+"/form");draft=await readRetry("participant/attempts/"+attempt);locked=false;renderQuestion();}
  function cleanTitle(value){return String(value||"").replace(/\s*\([^)]*\)/g,"").replace(/\s{2,}/g," ").trim();}
  function displayInstruction(form){const text=form.instruction||"";const options=(form.items||[]).flatMap(i=>i.options||[]);const short=options.length>0&&options.every(o=>/^[а-яa-z]$/i.test(String(o.text).trim()));if(short)return text;return text.replace(/\s*[—–-]\s*а или б/gi,"").replace(/\bа или б\b/gi,"").replace(/Обведите/g,"Отметьте").replace(/обведите/g,"отметьте").replace(/\s{2,}/g," ").trim();}
  function renderRanking(){
    const c=$("participant-content"),quota=(form.rules&&form.rules.quota)||{};
    const answers=new Map(draft.responses.map(r=>[r.item_id,r.value]));
    const counted={};for(const v of answers.values())counted[v]=(counted[v]||0)+1;
    c.innerHTML='<section class="card"><h2 id="method-title"></h2><p id="method-instruction" class="muted"></p><p id="ranking-progress" class="muted"></p><div id="ranking-grid" class="ranking-grid"></div><div class="toolbar"><button id="ranking-complete">Завершить и получить результат</button></div><button id="question-overview" class="text">← Назад</button></section>';
    $("method-title").textContent=cleanTitle(form.title)||"";
    $("method-instruction").textContent=displayInstruction(form)||"";
    const exhausted=v=>quota[v]!==undefined&&(counted[v]||0)>=quota[v];
    const grid=$("ranking-grid");
    for(const item of form.items){
      const row=document.createElement("label");row.className="ranking-row";
      const caption=document.createElement("span");caption.textContent=item.number+". "+(item.text||"");
      const select=document.createElement("select");select.setAttribute("aria-label","Ранг пункта "+item.number);
      const empty=document.createElement("option");empty.value="";empty.textContent="—";select.append(empty);
      for(const option of item.options){
        const used=exhausted(option.value)&&answers.get(item.id)!==option.value;
        const node=document.createElement("option");node.value=option.value;node.textContent=option.text;node.disabled=locked||used;
        if(answers.get(item.id)===option.value)node.selected=true;
        select.append(node);
      }
      select.onchange=()=>run(async()=>{
        if(locked)throw Error("Перечитайте прохождение.");
        const value=select.value;if(!value)return;
        const responses=[...draft.responses.filter(r=>r.item_id!==item.id).map(r=>({item_id:r.item_id,value:r.value})),{item_id:item.id,value}];
        draft=await request("participant/attempts/"+attempt+"/draft",{expected_revision:draft.revision,current_item_id:item.id,responses},"PUT");
        renderRanking();
      });
      row.append(caption,select);grid.append(row);
    }
    const met=Object.entries(quota).every(([rank,allowed])=>(counted[rank]||0)===allowed);
    const complete=answers.size===form.items.length&&met;
    $("ranking-progress").textContent="Оценено "+answers.size+" из "+form.items.length+". "+
      Object.entries(quota).map(([rank,allowed])=>"ранг "+rank+": "+(counted[rank]||0)+"/"+allowed).join(", ");
    blocked("ranking-complete",!complete||locked);
    bind("question-overview",reload);
    bind("ranking-complete",async()=>{if(locked)throw Error("Перечитайте прохождение.");renderResult(await request("participant/attempts/"+attempt+"/complete",{expected_revision:draft.revision}));});
  }
  function renderMeasurement(){
    const c=$("participant-content"),answers=new Map((draft.responses||[]).map(r=>[r.item_id,r.value]));
    const sexField=(passport&&passport.fields||[]).find(f=>/пол/i.test(String(f.label||f.key||"")));
    const sexKey=(sexField&&sexField.key)||"sex";
    const rawSex=(passport&&passport.values&&passport.values[sexKey])||(profileValues&&profileValues[sexKey])||(sexField&&sexField.value)||answers.get("q02")||"";
    const normalizeSex=value=>{const x=String(value||"").toLowerCase();if(x==="1"||x==="male"||x==="м"||x.indexOf("муж")===0)return "1";if(x==="2"||x==="female"||x==="ж"||x.indexOf("жен")===0)return "2";return "";};
    const sexKnown=normalizeSex(rawSex);
    c.innerHTML='<section class="card"><h2 id="method-title"></h2><p id="method-instruction" class="muted"></p><label>Время задержки дыхания, с<input id="measurement-seconds" type="number" inputmode="numeric" min="0" max="600" step="1" required></label><p class="muted">Замеряйте секундомером. Допустимо от 0 до 600 секунд.</p><p id="measurement-hint" class="muted"></p><div class="toolbar"><button id="measurement-complete">Завершить и получить результат</button></div><button id="question-overview" class="text">← Назад</button></section>';
    $("method-title").textContent=cleanTitle(form.title)||"Проба Генчи";$("method-instruction").textContent=form.instruction||"";
    $("measurement-seconds").value=answers.get("q01")||"";
    if(!sexKnown){$("measurement-hint").textContent="Пол не указан в паспортичке. Заполните пол в разделе «Сведения», затем вернитесь.";$("measurement-complete").disabled=true;$("measurement-complete").dataset.blocked="true";}
    else $("measurement-hint").textContent="Пол для оценки взят из паспортички.";
    $("measurement-seconds").addEventListener("input",()=>{const value=$("measurement-seconds").value;if(/[.,]/.test(value))$("measurement-hint").textContent="Только целые секунды: 40,5 недопустимо.";});
    bind("question-overview",reload);
    bind("measurement-complete",async()=>{
      if(locked)throw Error("Перечитайте прохождение.");
      const seconds=$("measurement-seconds").value.trim(),sex=sexKnown;
      if(!/^\d{1,3}$/.test(seconds)||Number(seconds)<0||Number(seconds)>600)throw Error("Введите целое число секунд от 0 до 600.");
      if(sex!=="1"&&sex!=="2")throw Error("В паспортичке не указан пол. Заполните сведения и повторите.");
      const responses=[{item_id:"q01",value:String(Number(seconds))},{item_id:"q02",value:sex}];
      draft=await request("participant/attempts/"+attempt+"/draft",{expected_revision:draft.revision,current_item_id:"q01",responses},"PUT");
      renderResult(await request("participant/attempts/"+attempt+"/complete",{expected_revision:draft.revision}));
    });
  }
  function renderQuestion(){
    if(form.presentation&&form.presentation.id==="pedpsy/ranking-grid")return renderRanking();
    if(form.presentation&&form.presentation.id==="pedpsy/breath-hold")return renderMeasurement();
    const q=question(form,draft),c=$("participant-content");
    const profile=typeof window.PedPsyMethodPresenters.profileFor==="function"?window.PedPsyMethodPresenters.profileFor(form):null;
    const presenter=(profile&&profile.presenter)||form.presentation||{id:"pedpsy/single-choice",version:"1.0"};
    const scale=profile&&profile.scale;
    const required=!scale||scale.required!==false;
    // The instruction belongs to the start of the attempt, not to every slide.
    const instruction=displayInstruction(form)||"Выберите более подходящее утверждение. Это учебное прохождение, не научно утверждённое заключение.";
    const showInstruction=q.index===0;
    c.innerHTML='<section class="card question-card"><h2 id="method-title" hidden></h2>'+
      (showInstruction?'<section class="method-instruction" aria-labelledby="method-instruction-heading"><h3 id="method-instruction-heading">Инструкция</h3><p id="method-instruction"></p></section>':'')+
      '<p id="method-scale-help" class="muted" hidden></p><p id="method-question"></p><label for="question-progress">Ваш прогресс</label><progress id="question-progress"></progress><p id="question-number"></p><fieldset id="question-pair" class="question-pair" aria-label="Ответ на вопрос"></fieldset><div class="toolbar"><button id="question-prev" class="secondary">Назад</button><button id="question-next">Далее</button><button id="question-complete" hidden>Завершить и получить результат</button></div><button id="question-overview" class="text">← Назад</button></section>';
    $("method-title").textContent=cleanTitle(form.title)||"Тест Томаса—Килманна";
    if(showInstruction)$("method-instruction").textContent=instruction;
    $("method-question").textContent=q.item.text||"";
    $("method-question").hidden=!q.item.text;
    const stimulusText=String(q.item.text||"").trim();
    $("method-question").classList.toggle("method-stimulus",stimulusText.length>0&&stimulusText.length<=40&&!/\s/.test(stimulusText));
    const bipolar=q.item.options.some(o=>String(o.text).replace(/−/g,"-").trim()==="-3");
    $("method-scale-help").hidden=!bipolar;
    $("method-scale-help").textContent=bipolar?"−3…−1 — согласие с первым утверждением, 0 — оба верны, 1…3 — со вторым.":"";
    $("question-progress").max=q.total;
    $("question-progress").value=draft.responses.length;
    $("question-number").textContent="Вопрос "+(q.index+1)+" из "+q.total;
    const selected=draft.responses.find(r=>r.item_id===q.item.id)?.value;
    const hasSelected=selected!==undefined&&selected!==null;
    const nextBlocked=hasAnswer=>q.index===q.total-1||(required&&!hasAnswer)||locked;
    window.PedPsyMethodPresenters.mount(presenter,{container:$("question-pair"),item:q.item,selected,disabled:locked,scale,onChange:value=>{
      if(locked)return;
      draft={...draft,responses:draftChoice(draft,q.item.id,value,q.item.id,q.item.options.map(o=>o.value)).responses};
      const hasAnswer=draft.responses.some(r=>r.item_id===q.item.id);
      $("question-progress").value=draft.responses.length;
      blocked("question-next",nextBlocked(hasAnswer));
      blocked("question-complete",draft.responses.length!==q.total||locked);
    }});
    blocked("question-prev",q.index===0||locked);
    blocked("question-next",nextBlocked(hasSelected));
    $("question-complete").hidden=q.index!==q.total-1;
    blocked("question-complete",draft.responses.length!==q.total||locked);
    async function move(index){if(locked)throw Error("Перечитайте прохождение.");draft=await request("participant/attempts/"+attempt+"/draft",{expected_revision:draft.revision,current_item_id:form.items[index].id,responses:draft.responses.map(r=>({item_id:r.item_id,value:r.value}))},"PUT");renderQuestion();}
    bind("question-prev",()=>move(q.index-1));bind("question-next",()=>move(q.index+1));bind("question-overview",reload);bind("question-complete",async()=>{if(locked)throw Error("Перечитайте прохождение.");if(draft.responses.length!==q.total)throw Error("Ответьте на все вопросы.");draft=await request("participant/attempts/"+attempt+"/draft",{expected_revision:draft.revision,current_item_id:q.item.id,responses:draft.responses.map(r=>({item_id:r.item_id,value:r.value}))},"PUT");renderResult(await request("participant/attempts/"+attempt+"/complete",{expected_revision:draft.revision}));});
  }
  async function backToMethods(){showParticipantToolbar();if(!activeStageId){await reload();return;}const s=await request("participant/stages");const stage=(s.stages||[]).find(x=>x.stage_id===activeStageId);if(!stage){await reload();return;}stages=s;try{await openStage(stage);}catch{await reload();}}
  async function markInvalidated(){if(!attempt)return;const info=await request("participant/attempts/"+attempt+"/invalidated");if(!info.invalidated)return;
    const c=$("participant-content"),card=document.createElement("section"),button=document.createElement("button");card.className="card";
    card.innerHTML='<h2>Результат недействителен</h2><p class="muted">При прохождении варианты 1–3 показывали неверные подписи, поэтому этот результат нельзя использовать. Пройдите методику заново — прежний результат сохранится в истории как недействительный.</p>';
    button.id="retry-attempt";button.type="button";button.textContent="Пройти заново";
    button.addEventListener("click",()=>run(async()=>{const r=await request("participant/attempts/"+attempt+"/retry",{});await openAttempt({attempt_id:r.attempt_id,status:"draft"});}));
    card.append(button);c.append(card);}
  function renderResult(result){hideParticipantToolbar();const c=$("participant-content");if(result.presentation){c.innerHTML=resultMarkup(result.presentation);bind("result-methods",backToMethods);markInvalidated().catch(()=>{});return;}c.innerHTML='<section class="card"><div class="result-toolbar"><button id="result-methods" class="result-back" type="button" aria-label="К методикам">К методикам</button></div><h2>Ваши результаты</h2><p class="muted" id="result-note"></p><div id="own-measures" class="results-grid"></div></section>';markInvalidated().catch(()=>{});
    const classifications=result.classifications||[],suffix=" – уровень",levels=new Map();
    for(const x of classifications){if(x&&typeof x.code==="string"&&x.code.endsWith(suffix))levels.set(x.code.slice(0,-suffix.length).trim(),String(x.value));}
    const hasLevels=levels.size>0;let note;
    if(result.handler_version==="legacy-numeric-1.0.0")note="Учебный результат по исходному ключу; применимость норм и интерпретаций отдельно не утверждена."+(result.norms_incomplete?" Для части значений нормативное преобразование неоднозначно и не выполнено.":"");
    else if(result.method_version_id==="umics_pi_ru_13@1.0.0-local")note="Учебный результат: суммы и средние по трём шкалам. Нормативные уровни и общий балл не рассчитываются.";
    else if(result.method_version_id==="prfq_ru_16_kamskaya_2023@1.0.0-local")note="Учебный результат: средние значения шкал, станайны и уровни по таблицам исходного процессора. Применимость норм отдельно не утверждена.";
    else if(result.method_version_id==="reflexivity_karpov_27@1.0.0-local")note="Учебный результат. Стен и уровень рассчитаны по таблице исходного процессора; применимость норм отдельно не утверждена.";
    else if(String(result.method_version_id).startsWith("genchi_breath_hold@"))note="Результат не является психологическим диагнозом.";
    else if(String(result.method_version_id).startsWith("ecv_15@"))note="Результат не является психологическим диагнозом.";
    else if(String(result.method_version_id).startsWith("shpana_20@"))note="Ниже — только описательное соотношение шкал, не диагноз.";
    else if(hasLevels)note="Уровень определяется как положение балла относительно количественных границ ключа. Не является психологическим диагнозом.";
    else note="Результат не является психологическим диагнозом.";
    $("result-note").textContent=note;
    $("own-measures").classList.add("results-centered");
    const toneForLevel=value=>{const text=String(value||"").toLowerCase();if(text.includes("крайне")||text.includes("очень низ"))return "very-low";if(text.includes("очень высок"))return "very-high";if(text.includes("низ"))return "low";if(text.includes("ниже"))return "below";if(text.includes("сред"))return "medium";if(text.includes("выше"))return "above";if(text.includes("высок"))return "high";return "neutral";};
    const addTile=(label,value,level,detail,outOf)=>{const tile=document.createElement("article"),head=document.createElement("div"),title=document.createElement("h3"),badge=document.createElement("span"),score=document.createElement("div"),strong=document.createElement("strong"),unit=document.createElement("span");tile.className="results-tile tone-"+toneForLevel(level);head.className="results-tile-head";title.className="results-tile-title";title.textContent=label;badge.className="results-badge";badge.textContent=level||"";badge.hidden=!level;head.append(title,badge);score.className="results-tile-score"+(outOf?" is-out-of":"");strong.textContent=value;unit.textContent=outOf||"балл";score.append(strong,unit);tile.append(head,score);if(detail){const text=document.createElement("p");text.className="results-tile-text";text.textContent=detail;tile.append(text);}$("own-measures").append(tile);};
    const ecvResult=String(result.method_version_id).startsWith("ecv_15@");
    for(const m of result.measures){const level=levels.get(m.code);addTile(m.label,m.value,level,ecvResult?"":(level?"Уровень определён по ключу методики.":""),ecvResult?"из 60":null);}
    for(const m of classifications.filter(x=>!String(x.code).endsWith(suffix))){addTile(m.label,m.value,"","");}
    if(String(result.method_version_id).startsWith("shpana_20@")){const val=code=>Number((result.measures.find(m=>m.code===code)||{}).value),pa=val("PA"),na=val("NA");
      if(Number.isFinite(pa)&&Number.isFinite(na)){const p=document.createElement("p");p.className="muted";p.id="shpana-interpretation";
        p.textContent=(pa>na?"Позитивный аффект выражен сильнее негативного: в последние недели вы чаще отмечали интерес, энергию и удовольствие, чем напряжение и раздражение."
          :pa<na?"Негативный аффект выражен сильнее позитивного: в последние недели чаще отмечались напряжение, раздражение или тревога, чем интерес и удовольствие."
          :"Обе шкалы выражены одинаково.")+" Это описательное соотношение шкал, а не диагноз.";
        c.querySelector("section.card").append(p);}}
    bind("result-methods",backToMethods);}
  function clear(){for(const i of root.querySelectorAll('input[type="password"]'))i.value="";csrf="";pendingCsrf="";invite="";sessionStorage.removeItem("pedpsy_invite");context=null;passport=null;consents=null;stages=null;form=null;draft=null;profileValues={};root.replaceChildren();}
  window.addEventListener("pagehide",clear);window.addEventListener("pageshow",e=>{if(e.persisted)location.reload();});
  run(async()=>{const parsed=entry(location.hash);invite=parsed.invite||sessionStorage.getItem("pedpsy_invite")||inviteCookie()||"";if(parsed.invite){sessionStorage.setItem("pedpsy_invite",parsed.invite);setInviteCookie(parsed.invite);}study=parsed.study||"";try{await reload();return;}catch(e){if(e.code!=="AUTH_REQUIRED")throw e;}if(invite){await preflight();context=await request("registration/context",undefined,undefined,true);study=context.study_id;history.replaceState(null,"","/workspace#participant");}renderLogin();});
})();
