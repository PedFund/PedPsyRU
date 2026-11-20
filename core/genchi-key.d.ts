export interface GenchiKey {
  id: string; type: string; handler: string; max_seconds: number;
  thresholds: Record<"male" | "female", {max_exclusive: number | null; rating: string}[]>;
}
export const GENCHI_KEY: GenchiKey;
export const GENCHI_KEY_DIGEST: string;
export function ratingFor(sex: "male" | "female", duration: number): string;
