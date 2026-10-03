import {scoreTki} from "../../core/tki-contract.js";
import type {TkiRequest, TkiResult} from "../../core/tki-contract.js";

// No formulas, normalization, versions or interpretation are replaced here.
export function calculatePinnedTki(input: TkiRequest): TkiResult {
  return scoreTki(input);
}
