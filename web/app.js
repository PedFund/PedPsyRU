"use strict";

(async function () {
  const byId = id => document.getElementById(id);
  const questionnaire = byId("questionnaire");
  const submit = byId("submit");
  const reset = byId("reset");
  const answers = Object.create(null);
  const fields = new Map();
  let data;
  let showMissing = false;
  let revision = 0;
  let pending;
  function hideResult() {byId("result").hidden = true; byId("measures").replaceChildren();}
  function focusPair(id) {fields.get(id).querySelector("input").focus();}
  function update() {
    const state = PedPsyForm.summarize(data.form.items, answers);
    byId("progress").value = state.answered;
    byId("progress-text").textContent = "Заполнено " + state.answered + " из " + state.total;
    byId("remaining").textContent = state.complete ? "Все пары заполнены" : "Осталось пар: " + state.missing.length;
    byId("submit-hint").textContent = state.complete ? "Все ответы выбраны. Можно проверить передачу обработчику." : "Для проверки нужны ответы на все 30 пар.";
    for (const [id, field] of fields) {
      const missing = showMissing && state.missing.includes(id);
      field.classList.toggle("is-missing", missing);
      field.querySelector(".pair-error").hidden = !missing;
      for (const input of field.querySelectorAll("input")) {
        input.setAttribute("aria-invalid", String(missing));
      }
    }
    byId("errors").hidden = !showMissing || state.complete;
    byId("error-text").textContent = "Не выбран ответ в парах: " + state.missing.length + ".";
    byId("missing-links").replaceChildren();
    for (const id of state.missing) {
      const link = document.createElement("a");
      link.href = "#" + id;
      link.textContent = String(Number(id.slice(1)));
      link.setAttribute("aria-label", "Перейти к паре " + Number(id.slice(1)));
      link.addEventListener("click", event => {event.preventDefault(); focusPair(id);});
      byId("missing-links").append(link);
    }
    return state;
  }
  function changed() {
    revision++;
    if (pending) {pending.abort(); pending = null;}
    submit.disabled = false;
    submit.textContent = "Проверить ответы";
    hideResult();
    byId("load-status").textContent = "";
    update();
  }
  try {
    const response = await fetch("/api/form", {cache: "no-store"});
    if (!response.ok) throw new Error("FORM_UNAVAILABLE");
    data = await response.json();
    byId("instruction").textContent = data.form.instruction;
    byId("versions").textContent = "Бланк " + data.form.version + " · ключ 1.0.0";
    for (const item of data.form.items) {
      const field = document.createElement("fieldset");
      field.className = "question"; field.id = item.id;
      const legend = document.createElement("legend"); legend.textContent = "Пара " + item.number;
      field.append(legend);
      for (const option of item.options) {
        const label = document.createElement("label"); label.className = "option";
        const input = document.createElement("input");
        input.type = "radio"; input.name = item.id; input.value = option.value; input.required = true;
        input.id = item.id + "-" + option.value; input.setAttribute("aria-describedby", item.id + "-error");
        input.addEventListener("change", () => {answers[item.id] = input.value; changed();});
        const text = document.createElement("span");
        const code = document.createElement("span"); code.className = "option-code"; code.textContent = option.label + ")";
        text.append(code, document.createTextNode(option.text)); label.append(input, text); field.append(label);
      }
      const error = document.createElement("p"); error.id = item.id + "-error"; error.className = "pair-error"; error.textContent = "Выберите один вариант — а или б."; error.hidden = true;
      field.append(error); fields.set(item.id, field); byId("questions").append(field);
    }
    byId("load-status").textContent = ""; submit.disabled = false; reset.disabled = false; update();
  } catch {
    byId("load-status").textContent = "Не удалось загрузить бланк. Проверьте, что локальный сервер запущен, и обновите страницу.";
    return;
  }
  questionnaire.addEventListener("submit", async event => {
    event.preventDefault(); hideResult(); showMissing = true;
    const state = update();
    if (!state.complete) {byId("errors").focus(); return;}
    const currentRevision = revision;
    const controller = new AbortController(); pending = controller;
    submit.disabled = true; submit.textContent = "Проверяем…";
    byId("load-status").textContent = "Передаём ответы локальному обработчику…";
    try {
      const response = await fetch("/api/score", {
        method: "POST", headers: {"Content-Type": "application/json"}, signal: controller.signal,
        body: JSON.stringify(PedPsyForm.buildRequest(data.form.items, answers, data.versions))
      });
      const payload = await response.json();
      if (currentRevision !== revision) return;
      if (!response.ok || payload.result?.status !== "scored") throw new Error("SCORING_REJECTED");
      for (const measure of payload.result.measures) {
        const row = document.createElement("div"); row.className = "measure";
        const label = document.createElement("span"); label.textContent = measure.label;
        const score = document.createElement("strong"); score.textContent = measure.value + " / 12";
        row.append(label, score); byId("measures").append(row);
      }
      byId("load-status").textContent = "Проверка завершена. Данные не сохранены.";
      byId("result").hidden = false; byId("result").focus();
    } catch (error) {
      if (error.name !== "AbortError" && currentRevision === revision) byId("load-status").textContent = "Не удалось обработать ответы. Они остаются на странице: попробуйте снова. Результат не сохранён.";
    } finally {
      if (pending === controller) {pending = null; submit.disabled = false; submit.textContent = "Проверить ответы";}
    }
  });
  reset.addEventListener("click", () => byId("reset-dialog").showModal());
  byId("cancel-reset").addEventListener("click", () => byId("reset-dialog").close());
  byId("confirm-reset").addEventListener("click", () => {
    // A control's id/name can shadow a form's native reset method.
    byId("reset-dialog").close(); HTMLFormElement.prototype.reset.call(questionnaire);
    for (const id of Object.keys(answers)) delete answers[id];
    showMissing = false; changed(); focusPair(data.form.items[0].id);
  });
})();
