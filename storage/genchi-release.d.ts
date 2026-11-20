export interface GenchiReleaseForm {
  id: string; version: string; title: string; instruction: string; language: string;
  presentation: {id: string; version: string};
  rules: {require_all: boolean};
  items: {id: string; number: number; text: string; options: {value: string; text: string}[]}[];
}
export function genchiReleasePackage(): {
  methodVersionId: string; handlerVersion: string; verificationState: string;
  form: GenchiReleaseForm; formSnapshot: string; formDigest: string; keyDigest: string;
};
export const GENCHI_FORM: GenchiReleaseForm;
export const GENCHI_KEY: {id: string; type: string; handler: string; max_seconds: number};
export const GENCHI_KEY_DIGEST: string;
