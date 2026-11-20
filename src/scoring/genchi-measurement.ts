import {GENCHI_KEY, GENCHI_KEY_DIGEST, ratingFor as ratingFromKey} from "../../core/genchi-key.js";
import type {InstrumentResult} from "../ports/instruments.js";
import type {MethodData,MethodRuntimeDescriptor,MethodRuntimeModule} from "../ports/method-runtime.js";

// Genchi breath-hold probe. A functional measurement, not a questionnaire: two
// technical fields carry it through the existing attempt protocol (seconds and the
// sex used for the rating). Thresholds come from the owner's passport.
export type GenchiSex = "male" | "female";
export interface GenchiMeasurement {readonly duration_seconds: number; readonly sex: GenchiSex}
export interface GenchiResult {readonly duration_seconds: number; readonly rating: string}
export const GENCHI_METHOD_VERSION_ID = "genchi_breath_hold@1.0.0";
export const GENCHI_HANDLER_VERSION = "genchi-measurement-1.0.0";
export {GENCHI_KEY, GENCHI_KEY_DIGEST};
const MAX_SECONDS = GENCHI_KEY.max_seconds;
const isSex = (value: unknown): value is GenchiSex => value === "male" || value === "female";
const isDuration = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= MAX_SECONDS;
export function ratingFor(sex: GenchiSex, duration: number): string {
  return ratingFromKey(sex, duration);
}
export function readMeasurement(data: unknown): GenchiMeasurement {
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("GENCHI_MEASUREMENT_INVALID");
  const candidate = data as {duration_seconds?: unknown; sex?: unknown};
  if (!isDuration(candidate.duration_seconds)) throw new Error("GENCHI_DURATION_INVALID");
  if (!isSex(candidate.sex)) throw new Error("GENCHI_SEX_REQUIRED");
  return {duration_seconds: candidate.duration_seconds, sex: candidate.sex};
}
export function scoreGenchi(data: unknown): GenchiResult {
  const measurement = readMeasurement(data);
  return {duration_seconds: measurement.duration_seconds, rating: ratingFor(measurement.sex, measurement.duration_seconds)};
}
function invalid(warning: string): InstrumentResult {
  return {contract_version: "1.0", method_version_id: GENCHI_METHOD_VERSION_ID, handler_version: GENCHI_HANDLER_VERSION,
    status: "invalid", validation_state: "legacy_checked", warnings: [{code: warning, severity: "error", details: {}}],
    measures: [], classifications: [], quality: {valid_response_count: 0, complete: false, usable_for_aggregation: false},
    calculation: {algorithm_id: GENCHI_HANDLER_VERSION, key_digest: GENCHI_KEY_DIGEST}};
}
export function scoreGenchiResponses(input: unknown): InstrumentResult {
  if (!input || typeof input !== "object" || Array.isArray(input)) return invalid("INVALID_RESPONSES");
  const request = input as {contract_version?: unknown; method_version_id?: unknown; handler_version?: unknown; responses?: unknown};
  if (request.contract_version !== "1.0" || request.method_version_id !== GENCHI_METHOD_VERSION_ID ||
    request.handler_version !== GENCHI_HANDLER_VERSION || !Array.isArray(request.responses)) return invalid("INVALID_RESPONSES");
  if (request.responses.length !== 2) return invalid("INVALID_RESPONSES");
  const values: Record<string, string> = {};
  for (const response of request.responses) {
    if (!response || typeof response !== "object" || Array.isArray(response)) return invalid("INVALID_RESPONSES");
    const item = response as {item_id?: unknown; value?: unknown};
    if ((item.item_id !== "q01" && item.item_id !== "q02") || typeof item.value !== "string" || values[item.item_id]) return invalid("INVALID_RESPONSES");
    values[item.item_id] = item.value;
  }
  if (!/^\d{1,3}$/.test(values.q01 ?? "") || !isSex(values.q02)) return invalid("INVALID_RESPONSES");
  const duration = Number(values.q01);
  if (!isDuration(duration)) return invalid("INVALID_RESPONSES");
  const rating = ratingFor(values.q02 as GenchiSex, duration);
  return {contract_version: "1.0", method_version_id: GENCHI_METHOD_VERSION_ID, handler_version: GENCHI_HANDLER_VERSION,
    status: "scored", validation_state: "legacy_checked", warnings: [],
    measures: [{code: "duration_seconds", label: "Время задержки дыхания, с", value: duration, value_type: "number", representation: "raw", precision: 0}],
    classifications: [{code: "rating", label: "Оценка", value: rating, basis: "genchi_thresholds"}],
    quality: {valid_response_count: 2, complete: true, usable_for_aggregation: true},
    calculation: {algorithm_id: GENCHI_HANDLER_VERSION, key_digest: GENCHI_KEY_DIGEST}};
}
const descriptor: MethodRuntimeDescriptor = {
  contract_version: "1.0", method_version_id: GENCHI_METHOD_VERSION_ID, handler_version: GENCHI_HANDLER_VERSION,
  key_digest: GENCHI_KEY_DIGEST, title: "Проба Генчи", authors: ["А.И. Пустозеров", "А.Г. Гостев"],
  presentation: {id: "pedpsy/breath-hold", version: "1.0.0"}, response_schema: {id: "pedpsy/measurement", version: "1.0.0"},
  result_schema: {id: "pedpsy/measurement-result", version: "1.0.0"},
  outputs: [{id: "duration_seconds", label: "Время задержки дыхания, с", kind: "raw"}, {id: "rating", label: "Оценка", kind: "level"}]
};
export const genchiMeasurementModule: MethodRuntimeModule = {
  descriptor,
  checkDraft(data: MethodData) {
    const result = scoreGenchiResponses(data);
    return {valid: result.status === "scored", complete: result.status === "scored", issues: result.status === "scored" ? [] : ["INVALID_RESPONSES"]};
  },
  calculate(data: MethodData) {return scoreGenchiResponses(data) as unknown as MethodData;},
  acceptsResult(result: MethodData) {
    const value = result as unknown as InstrumentResult;
    return Boolean(value && value.status === "scored" && value.calculation?.key_digest === GENCHI_KEY_DIGEST &&
      Array.isArray(value.measures) && Array.isArray(value.classifications));
  },
  participantResult(result: MethodData) {
    const value = result as unknown as InstrumentResult;
    return {measures: value.measures.map(m => ({code: m.code, label: m.label, value: m.value, representation: m.representation})),
      classifications: (value.classifications as {code: string; label: string; value: string}[]).map(c => ({code: c.code, label: c.label, value: c.value}))} as unknown as MethodData;
  }
};
