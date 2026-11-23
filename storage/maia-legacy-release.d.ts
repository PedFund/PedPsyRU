export interface MaiaLegacyForm {
  id: string;
  version: string;
  title?: string;
  instruction?: string;
  presentation?: {id: string; version: string};
  items: readonly {
    id: string;
    number: number;
    text?: string;
    options: readonly {value: string; text: string}[];
  }[];
}
export interface MaiaLegacyRelease {
  methodVersionId: string;
  handlerVersion: string;
  verificationState: string;
  form: MaiaLegacyForm;
  formSnapshot: string;
  formDigest: string;
  keyDigest: string;
  key: unknown;
}
export function maiaLegacyRelease(): MaiaLegacyRelease;
