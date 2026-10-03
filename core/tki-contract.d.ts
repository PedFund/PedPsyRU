// Type boundary only; the existing JavaScript scorer and its key are unchanged.
export interface TkiResponse { readonly item_id: string; readonly value: "A" | "B" }
export interface TkiRequest {
  readonly contract_version: "1.0";
  readonly method_version_id: "tki_ru_30_pairs@1.0.0";
  readonly handler_version: "tki-contract-0.3.0";
  readonly responses: readonly TkiResponse[];
}
export interface TkiResult {
  contract_version: string;
  method_version_id: string;
  handler_version: string;
  status: "invalid" | "blocked" | "incomplete" | "error" | "scored";
  validation_state: "key_verified";
  quality: {valid_response_count: number; complete: boolean; usable_for_aggregation: boolean};
  measures: {code: string; label: string; value: number; value_type: "number"; representation: "raw"; precision: number}[];
  classifications: unknown[];
  warnings: {code: string; severity: "error"; details: Record<string, unknown>}[];
  calculation: {algorithm_id: string; key_digest: string};
}
export function scoreTki(request: unknown): TkiResult;
export const CONTRACT_VERSION: "1.0";
export const METHOD_VERSION_ID: "tki_ru_30_pairs@1.0.0";
export const HANDLER_VERSION: "tki-contract-0.3.0";
