import type {InstrumentResult} from "./instrument-contract.js";
export const CONTRACT_VERSION: string;
export const HANDLER_VERSION: string;
export const LEVEL_SUFFIX: string;
export function createApprovedNumericScorer(entries: readonly unknown[]): (input: unknown) => InstrumentResult;
