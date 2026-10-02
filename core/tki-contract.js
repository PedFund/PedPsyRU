"use strict";

// Draft adapter: preserves the existing scorer and labels its results as unverified.
const {createHash} = require("node:crypto");
const Methods = require("../methods.js");
const Processor = require("../processor.js");

const CONTRACT_VERSION = "1.0";
const METHOD_VERSION_ID = "tki_ru_30_pairs@legacy-5.5.8-draft";
const HANDLER_VERSION = "tki-contract-0.1.0";
const KEY_DIGEST = "79bd631d151ffc5d8a984cb4746135a7a73a3da6ad7901959da107d638654925";
const SCALE_CODES = Object.freeze({
  "Соперничество": "competing",
  "Сотрудничество": "collaborating",
  "Компромисс": "compromising",
  "Избегание": "avoiding",
  "Приспособление": "accommodating"
});

function keyDigest(method) {
  return createHash("sha256").update(JSON.stringify({
    id: method.id, items: method.items, type: method.type, scales: method.scales
  })).digest("hex");
}

function scoreTki(request) {
  const result = {
    contract_version: CONTRACT_VERSION,
    method_version_id: METHOD_VERSION_ID,
    handler_version: HANDLER_VERSION,
    status: "invalid",
    validation_state: "requires_source_verification",
    quality: {valid_response_count: 0, complete: false, usable_for_aggregation: false},
    measures: [],
    classifications: [],
    warnings: [],
    calculation: {algorithm_id: "tki_ru_30_pairs", key_digest: "sha256:" + KEY_DIGEST}
  };
  const reject = (code, details = {}, status = "invalid") => {
    result.status = status;
    result.warnings.push({code, severity: "error", details});
    return result;
  };
  if (!request || typeof request !== "object" || Array.isArray(request)) return reject("INVALID_REQUEST");
  if (request.contract_version !== CONTRACT_VERSION || request.method_version_id !== METHOD_VERSION_ID || request.handler_version !== HANDLER_VERSION) {
    return reject("UNSUPPORTED_VERSION", {}, "blocked");
  }
  if (!Array.isArray(request.responses)) return reject("INVALID_RESPONSES");
  const answers = Array(30).fill(null);
  const seen = new Set();
  for (const response of request.responses) {
    if (!response || typeof response !== "object" || Array.isArray(response)) return reject("INVALID_RESPONSE");
    if (typeof response.item_id !== "string" || !/^q(?:0[1-9]|[12][0-9]|30)$/.test(response.item_id)) {
      return reject("UNKNOWN_ITEM", {item_id: response.item_id ?? null});
    }
    if (seen.has(response.item_id)) return reject("DUPLICATE_ITEM", {item_id: response.item_id});
    seen.add(response.item_id);
    // Input is canonical. Legacy Excel/text normalization belongs in an import adapter.
    if (response.value !== "A" && response.value !== "B") return reject("INVALID_ANSWER", {item_id: response.item_id});
    answers[Number(response.item_id.slice(1)) - 1] = response.value;
    result.quality.valid_response_count++;
  }
  const missing = answers.flatMap((value, index) => value === null ? ["q" + String(index + 1).padStart(2, "0")] : []);
  if (missing.length) return reject("MISSING_ANSWERS", {item_ids: missing}, "incomplete");
  result.quality.complete = true;

  const method = Methods.byId.tki_ru_30_pairs;
  if (!method || keyDigest(method) !== KEY_DIGEST) return reject("KEY_SNAPSHOT_CHANGED", {}, "blocked");
  const scored = Processor.scoreComplete(method, answers);
  if (scored.status !== "Обработано" || scored.warnings.length || Object.keys(scored.metrics).length !== 5) {
    return reject("LEGACY_SCORING_FAILED", {}, "error");
  }
  const scores = Object.values(scored.metrics);
  if (!scores.every(value => Number.isInteger(value) && value >= 0) || scores.reduce((sum, value) => sum + value, 0) !== 30) {
    return reject("SCORING_INVARIANT_FAILED", {}, "error");
  }
  result.status = "scored";
  result.measures = Object.entries(scored.metrics).map(([label, value]) => ({
    code: SCALE_CODES[label], label, value, value_type: "number", representation: "raw", precision: 0
  }));
  result.warnings.push({
    code: "KEY_SOURCE_CONFLICT", severity: "warning",
    details: {item_id: "q21", alternative: "A", legacy_scale: "avoiding", publication_scale: "accommodating"}
  });
  return result;
}

module.exports = {scoreTki, CONTRACT_VERSION, METHOD_VERSION_ID, HANDLER_VERSION};
