import type {TkiResponse} from "../core/tki-contract.js";
export function canonicalJson(value: unknown): string;
export function responsesDigest(items: readonly {item_id: string}[], responses: readonly TkiResponse[]): string;
export function releasePackage(): {
  form: {id: string; version: string; items: {id: string; number: number; options: unknown[]}[]};
  formSnapshot: string; formDigest: string; keyDigest: string;
};
