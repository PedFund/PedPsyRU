"use strict";
// Participant result presentation. The renderer is selected by the result DTO,
// so a method opts into a layout in its own presentation profile. Only
// "level-numeric" is implemented now; the remaining variants are reserved for
// later work and must not be inferred from a method title or its scale.
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.PedPsyResult = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const VARIANTS = Object.freeze([
    "profile",
    "level-only",
    "level-numeric",
    "level-graphic",
    "extended-text"
  ]);

  function formatScore(value, digits = 1) {
    const number = Number(value);
    if (!Number.isFinite(number)) return "";
    const precision = Number.isInteger(digits) && digits >= 0 ? digits : 1;
    return new Intl.NumberFormat("ru-RU", {
      minimumFractionDigits: precision,
      maximumFractionDigits: precision,
      useGrouping: false
    }).format(number);
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, character => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[character]);
  }

  // The scored level is a word, not a number. Map it to a quiet tone so the
  // cards can show structure without introducing a red/green judgement.
  function levelTone(level) {
    const text = String(level || "").trim().toLowerCase();
    if (!text) return "neutral";
    if (/крайне\s+высок|очень\s+высок/.test(text)) return "very-high";
    if (/крайне\s+низк|очень\s+низк/.test(text)) return "very-low";
    if (/выше\s+средн/.test(text)) return "above";
    if (/ниже\s+средн/.test(text)) return "below";
    if (/высок/.test(text)) return "high";
    if (/низк/.test(text)) return "low";
    if (/средн/.test(text)) return "medium";
    return "neutral";
  }

  function scorePercent(card) {
    const min = Number(card.min);
    const max = Number(card.max);
    const value = Number(card.value);
    if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min || !Number.isFinite(value)) return null;
    return Math.max(3, Math.min(97, ((value - min) / (max - min)) * 100));
  }

  // Flatten the method-defined groups without inventing measures. The category is
  // the level already calculated by scoring; it is never derived from the display
  // rounding of the numeric value.
  function levelNumericCards(view) {
    return (view && Array.isArray(view.groups) ? view.groups : [])
      .flatMap(group => group && Array.isArray(group.measures) ? group.measures : [])
      .map(measure => ({
        code: measure.code,
        label: measure.label,
        level: measure.level || null,
        value: measure.value,
        displayNumber: formatScore(measure.value, 1),
        displayValue: formatScore(measure.value, 1) + " балла",
        min: measure.min,
        max: measure.max,
        levelText: measure.level_text || null,
        description: measure.description || null
      }));
  }

  function tileMarkup(card) {
    const tone = levelTone(card.level);
    const percent = scorePercent(card);
    const badge = `<span class="results-badge">${escapeHtml(card.level || "—")}</span>`;
    const scale = percent === null
      ? ""
      : `<div class="results-scale" role="img" aria-label="Положение балла на шкале показателя"><span class="results-scale-marker" style="left:${percent.toFixed(1)}%"></span></div>`;
    const extra = card.levelText || card.description
      ? `<p class="results-tile-text">${escapeHtml(card.levelText || card.description)}</p>`
      : "";
    return `<article class="results-tile tone-${tone}" aria-label="${escapeHtml(card.label)}: ${escapeHtml(card.displayValue)}, ${escapeHtml(card.level || "без уровня")}">` +
      `<div class="results-tile-head"><h3 class="results-tile-title">${escapeHtml(card.label)}</h3>${badge}</div>` +
      `<div class="results-tile-score"><strong>${escapeHtml(card.displayNumber)}</strong><span>балла</span></div>` +
      scale +
      extra +
    `</article>`;
  }

  function supports(view) {
    return Boolean(view && view.variant === "level-numeric");
  }

  function markup(view) {
    if (!supports(view)) throw new Error("RESULT_VARIANT_UNSUPPORTED");
    const heading = view.heading || view.title || "Ваши результаты";
    const subtitle = view.subtitle
      ? `<p class="results-subtitle">${escapeHtml(view.subtitle)}</p>`
      : "";
    const meta = view.item_count
      ? `<p class="results-meta">${escapeHtml(view.item_count)} ${escapeHtml(view.item_unit || "пунктов")}</p>`
      : "";
    const cards = levelNumericCards(view).map(tileMarkup).join("");
    const note = view.footer_note
      ? `<p class="results-note">${escapeHtml(view.footer_note)}</p>`
      : "";
    return `<section class="card result-card results-level-numeric">` +
      `<div class="result-toolbar"><button id="result-methods" class="result-back" type="button" aria-label="К методикам">К методикам</button></div>` +
      `<header class="results-header">` +
        `<p class="results-eyebrow">Ваши результаты</p>` +
        `<h2>${escapeHtml(heading)}</h2>` +
        subtitle +
        meta +
        `<p class="results-caption sr-only">Уровень выраженности</p>` +
      `</header>` +
      `<div class="results-grid">${cards}</div>` +
      note +
    `</section>`;
  }

  return {VARIANTS, formatScore, levelNumericCards, levelTone, supports, markup};
});
