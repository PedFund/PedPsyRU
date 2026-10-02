(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.PedPsyForm = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  function summarize(items, answers) {
    const missing = items.filter(item => answers[item.id] !== "A" && answers[item.id] !== "B").map(item => item.id);
    return {total: items.length, answered: items.length - missing.length, missing, complete: missing.length === 0};
  }
  function buildRequest(items, answers, versions) {
    if (!summarize(items, answers).complete) throw new Error("MISSING_ANSWERS");
    return {
      contract_version: versions.contract_version,
      method_version_id: versions.method_version_id,
      handler_version: versions.handler_version,
      responses: items.map(item => ({item_id: item.id, value: answers[item.id]}))
    };
  }
  function slideState(items, index) {
    if (!items.length || !Number.isInteger(index)) throw new Error("INVALID_SLIDE");
    const current = Math.max(0, Math.min(items.length - 1, index));
    return {index: current, item_id: items[current].id, number: current + 1,
      total: items.length, isFirst: current === 0, isLast: current === items.length - 1};
  }
  return {summarize, buildRequest, slideState};
});
