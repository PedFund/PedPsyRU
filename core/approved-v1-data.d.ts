export interface ApprovedEntry {
  readonly id: string;
  readonly version: string;
  readonly methodVersionId: string;
  readonly key: unknown;
  readonly pins: {readonly key: string};
  readonly package: unknown;
  readonly title: string;
  readonly itemCount: number;
  readonly valid: readonly string[];
  readonly authors: readonly string[];
  readonly search: readonly string[];
}
export const entries: readonly ApprovedEntry[];
export function loadApprovedV1(): ApprovedEntry[];
