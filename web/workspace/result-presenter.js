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
        displayValue: formatScore(measure.value, 1) + " балла"
      }));
  }

  function supports(view) {
    return Boolean(view && view.variant === "level-numeric");
  }

  function markup(view) {
    if (!supports(view)) throw new Error("RESULT_VARIANT_UNSUPPORTED");
    const heading = view.heading || "Ваши результаты";
    const subtitle = view.subtitle
      ? `<p class="results-subtitle">${escapeHtml(view.subtitle)}</p>`
      : "";
    const cards = levelNumericCards(view).map(card => (
      `<article class="results-tile">` +
        `<h3 class="results-tile-title">${escapeHtml(card.label)}</h3>` +
        `<p class="results-tile-caption">Уровень выраженности</p>` +
        `<p class="results-tile-level">${escapeHtml(card.level || "—")}</p>` +
        `<p class="results-tile-value">${escapeHtml(card.displayValue)}</p>` +
      `</article>`
    )).join("");
    const note = view.footer_note
      ? `<p class="results-note">${escapeHtml(view.footer_note)}</p>`
      : "";
    return `<section class="card result-card results-level-numeric">` +
      `<div class="result-toolbar"><button id="result-methods" class="result-back" type="button" aria-label="К методикам">К методикам</button></div>` +
      `<header class="results-header"><h2>${escapeHtml(heading)}</h2>${subtitle}</header>` +
      `<div class="results-grid">${cards}</div>` +
      note +
    `</section>`;
  }

  return {VARIANTS, formatScore, levelNumericCards, supports, markup};
});
