"use strict";
// Universal answer scale for sequential methods. Presentation only: it never
// changes item text, stored answer values, keys, scoring or historical results.
// A method profile supplies the number of gradations, stored values, display
// labels, captions, layout, required flag and selected style.
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.PedPsyScale = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const MAX_GRADATIONS = 20;
  const TYPES = new Set(["numeric", "text"]);
  const LAYOUTS = new Set(["auto", "row", "grid-3"]);
  const SELECTED_STYLES = new Set(["filled", "outline"]);

  function asText(value) {
    return value === undefined || value === null ? "" : String(value);
  }

  // Resolve a method-level scale profile against the pinned item options. The
  // option values stay exactly as the release pins them; display labels and
  // captions are a separate, purely presentational layer.
  function resolveScale(item, config) {
    const settings = config || {};
    if (!item || !Array.isArray(item.options) || item.options.length < 2 || item.options.length > MAX_GRADATIONS) {
      throw new Error("SCALE_OPTIONS_INVALID");
    }
    const stored = item.options.map(option => {
      if (!option || option.value === undefined || option.value === null || String(option.value) === "") {
        throw new Error("SCALE_VALUE_REQUIRED");
      }
      return String(option.value);
    });
    if (new Set(stored).size !== stored.length) throw new Error("SCALE_VALUES_DUPLICATE");
    const values = Array.isArray(settings.values) ? settings.values.map(asText) : stored.slice();
    if (values.length !== stored.length || values.some((value, index) => value !== stored[index])) {
      throw new Error("SCALE_VALUES_MISMATCH");
    }
    const labels = Array.isArray(settings.labels)
      ? settings.labels.map(asText)
      : item.options.map((option, index) => asText(option.text) || stored[index]);
    if (labels.length !== stored.length) throw new Error("SCALE_LABELS_MISMATCH");
    const captions = Array.isArray(settings.captions) ? settings.captions.map(asText) : [];
    if (captions.length && captions.length !== stored.length) throw new Error("SCALE_CAPTIONS_MISMATCH");

    const type = TYPES.has(settings.type) ? settings.type : "numeric";
    const layout = LAYOUTS.has(settings.layout) ? settings.layout : "auto";
    const selectedStyle = SELECTED_STYLES.has(settings.selectedStyle) ? settings.selectedStyle : "filled";
    const minLabel = settings.minLabel !== undefined ? asText(settings.minLabel) : (captions[0] || "");
    const maxLabel = settings.maxLabel !== undefined ? asText(settings.maxLabel) : (captions[captions.length - 1] || "");
    const required = settings.required !== false;
    const cells = stored.map((value, index) => {
      const label = labels[index];
      const caption = captions[index] || "";
      return Object.freeze({
        value,
        label,
        caption,
        display: type === "text" ? (caption || label) : label
      });
    });
    const first = labels[0];
    const last = labels[labels.length - 1];
    const groupLabel = settings.groupLabel !== undefined
      ? asText(settings.groupLabel)
      : "Шкала ответа от " + first + " до " + last +
        (minLabel || maxLabel
          ? ", где " + first + " — " + (minLabel || "крайнее значение") + ", " + last + " — " + (maxLabel || "крайнее значение")
          : "") + ".";
    return Object.freeze({
      type,
      layout,
      selectedStyle,
      required,
      count: cells.length,
      values: Object.freeze(values),
      labels: Object.freeze(labels),
      captions: Object.freeze(captions),
      cells: Object.freeze(cells),
      minLabel,
      maxLabel,
      firstLabel: first,
      lastLabel: last,
      groupLabel
    });
  }

  function cellAccessibleName(cell, model, index) {
    const parts = [cell.display];
    if (cell.caption && cell.caption !== cell.display) parts.push(cell.caption);
    if (index === 0 && model.minLabel && model.minLabel !== cell.caption) parts.push(model.minLabel);
    if (index === model.count - 1 && model.maxLabel && model.maxLabel !== cell.caption) parts.push(model.maxLabel);
    return parts.join(", ");
  }

  function mount({container, item, selected, disabled, onChange, scale}) {
    if (!container || !container.ownerDocument) throw new Error("SCALE_CONTAINER_REQUIRED");
    const model = resolveScale(item, scale);
    const doc = container.ownerDocument;
    const root = doc.createElement("div");
    root.className = "scale scale-" + model.type + " scale-layout-" + model.layout +
      " scale-selected-" + model.selectedStyle;
    root.setAttribute("role", "radiogroup");
    root.setAttribute("aria-label", model.groupLabel);
    root.setAttribute("data-gradations", String(model.count));

    const options = doc.createElement("div");
    options.className = "scale-options";
    model.cells.forEach((cell, index) => {
      const label = doc.createElement("label");
      label.className = "scale-option";
      const input = doc.createElement("input");
      input.type = "radio";
      input.name = "response";
      input.value = cell.value;
      input.checked = selected !== undefined && selected !== null && String(selected) === cell.value;
      input.disabled = Boolean(disabled);
      if (model.required) input.required = true;
      input.setAttribute("aria-label", cellAccessibleName(cell, model, index));
      input.addEventListener("change", () => {
        if (!input.disabled) onChange(cell.value);
      });
      const face = doc.createElement("span");
      face.className = "scale-cell";
      face.setAttribute("aria-hidden", "true");
      const value = doc.createElement("span");
      value.className = "scale-cell-value";
      value.textContent = cell.display;
      face.append(value);
      if (model.type === "numeric" && cell.caption) {
        const caption = doc.createElement("small");
        caption.className = "scale-cell-caption";
        caption.textContent = cell.caption;
        face.append(caption);
      }
      label.append(input, face);
      options.append(label);
    });
    root.append(options);

    if (model.minLabel || model.maxLabel) {
      const ends = doc.createElement("div");
      ends.className = "scale-endpoints";
      ends.setAttribute("aria-hidden", "true");
      const min = doc.createElement("span");
      min.className = "scale-end scale-end-min";
      min.textContent = model.minLabel;
      const max = doc.createElement("span");
      max.className = "scale-end scale-end-max";
      max.textContent = model.maxLabel;
      ends.append(min, max);
      root.append(ends);
    }
    container.append(root);
    return model;
  }

  return {MAX_GRADATIONS, resolveScale, mount};
});
