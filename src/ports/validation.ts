import {ParticipationError} from "./errors.js";
import type {DraftInput} from "./participation.js";
function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
export function validateRevision(input: unknown): asserts input is {expected_revision: number} {
  if (!object(input) || Object.keys(input).join(",") !== "expected_revision" ||
    !Number.isSafeInteger(input.expected_revision) || (input.expected_revision as number) < 0 ||
    (input.expected_revision as number) >= Number.MAX_SAFE_INTEGER) throw new ParticipationError(400, "INVALID_COMPLETION");
}
export function validateDraft(input: unknown, itemIds: readonly string[],choiceValues:readonly string[]=["A","B"],quota?:Readonly<Record<string,number>>): asserts input is DraftInput {
  const fail = (): never => {throw new ParticipationError(400, "INVALID_DRAFT");};
  if (!object(input) || Object.keys(input).sort().join(",") !== "current_item_id,expected_revision,responses" ||
    !Number.isSafeInteger(input.expected_revision) || (input.expected_revision as number) < 0 ||
    (input.expected_revision as number) >= Number.MAX_SAFE_INTEGER ||
    typeof input.current_item_id !== "string" || !itemIds.includes(input.current_item_id) ||
    !Array.isArray(input.responses) || input.responses.length > itemIds.length) fail();
  const value = input as Record<string, unknown>;
  const seen = new Set<string>();
  for (const response of value.responses as unknown[]) {
    if (!object(response) || Object.keys(response).sort().join(",") !== "item_id,value" ||
      typeof response.item_id !== "string" || !itemIds.includes(response.item_id) || seen.has(response.item_id) ||
      typeof response.value!=="string" || !choiceValues.includes(response.value)) fail();
    seen.add((response as Record<string, unknown>).item_id as string);
  }
  // A ranking method fixes how many times a rank may be used. The rule is checked while
  // the draft is edited, so a participant learns about a violation before completing.
  if (quota && Object.keys(quota).length) {
    const counts = new Map<string, number>();
    for (const response of value.responses as {value: string}[]) counts.set(response.value, (counts.get(response.value) || 0) + 1);
    for (const [rank, allowed] of Object.entries(quota)) {
      if ((counts.get(rank) || 0) > allowed) throw new ParticipationError(409, "QUOTA_VIOLATION");
    }
  }
}
