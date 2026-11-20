import type {MethodData,MethodRuntimeDescriptor,MethodRuntimeModule} from "../ports/method-runtime.js";

// Genchi breath-hold probe (passport of 2026-11-19). This is a functional measurement,
// not a questionnaire: one duration in seconds and a sex-dependent rating.
export type GenchiSex = "male" | "female";
export interface GenchiMeasurement {readonly duration_seconds: number; readonly sex: GenchiSex}
export interface GenchiResult {readonly duration_seconds: number; readonly rating: string}

// Thresholds are copied from the owner's passport: max is exclusive.
const THRESHOLDS: Record<GenchiSex, readonly {min: number; max: number | null; rating: string}[]> = {
  male: [
    {min: 0, max: 20, rating: "неудовлетворительно"},
    {min: 20, max: 30, rating: "удовлетворительно"},
    {min: 30, max: 40, rating: "хорошо"},
    {min: 40, max: null, rating: "отлично"}
  ],
  female: [
    {min: 0, max: 15, rating: "неудовлетворительно"},
    {min: 15, max: 20, rating: "удовлетворительно"},
    {min: 20, max: 30, rating: "хорошо"},
    {min: 30, max: null, rating: "отлично"}
  ]
};
const MAX_SECONDS = 600;
const isSex = (value: unknown): value is GenchiSex => value === "male" || value === "female";
const isDuration = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= MAX_SECONDS;
export function ratingFor(sex: GenchiSex, duration: number): string {
  const band = THRESHOLDS[sex].find(item => duration >= item.min && (item.max === null || duration < item.max));
  if (!band) throw new Error("GENCHI_RATING_OUT_OF_RANGE");
  return band.rating;
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
const descriptor: MethodRuntimeDescriptor = {
  contract_version: "1.0", method_version_id: "genchi_breath_hold@1.0.0", handler_version: "genchi-measurement-1.0.0",
  key_digest: "sha256:" + "0".repeat(64), title: "Проба Генчи", authors: ["А.И. Пустозеров", "А.Г. Гостев"],
  presentation: {id: "pedpsy/breath-hold", version: "1.0.0"}, response_schema: {id: "pedpsy/measurement", version: "1.0.0"},
  result_schema: {id: "pedpsy/measurement-result", version: "1.0.0"},
  outputs: [{id: "duration_seconds", label: "Время задержки дыхания, с", kind: "raw"}, {id: "rating", label: "Оценка", kind: "level"}]
};
export const genchiMeasurementModule: MethodRuntimeModule = {
  descriptor,
  checkDraft(data: MethodData) {
    try {readMeasurement(data); return {valid: true, complete: true, issues: []};}
    catch (error) {return {valid: false, complete: false, issues: [(error as Error).message]};}
  },
  calculate(data: MethodData) {return scoreGenchi(data) as unknown as MethodData;},
  acceptsResult(result: MethodData) {
    try {const r = result as unknown as GenchiResult; return typeof r.duration_seconds === "number" && typeof r.rating === "string" && isDuration(r.duration_seconds);}
    catch {return false;}
  },
  // The sex used for the rating is not exposed to the participant-facing projection.
  participantResult(result: MethodData) {
    const r = result as unknown as GenchiResult;
    return {duration_seconds: r.duration_seconds, rating: r.rating} as unknown as MethodData;
  }
};
