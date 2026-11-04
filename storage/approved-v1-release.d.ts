export interface ApprovedRelease {
  readonly id: string;
  readonly title: string;
  readonly authors: readonly string[];
  readonly search: readonly string[];
  readonly form: {readonly id: string; readonly version: string; readonly method_id: string; readonly title: string;
    readonly language: string; readonly instruction: string;
    readonly items: readonly {readonly id: string; readonly number: number; readonly text: string;
      readonly options: readonly {readonly value: string; readonly text: string}[]}[]};
  readonly itemCount: number;
  readonly methodVersionId: string;
  readonly handlerVersion: string;
  readonly formSnapshot: string;
  readonly formDigest: string;
  readonly keyDigest: string;
  readonly verificationState: string;
  readonly outputs: readonly string[];
}
export interface ApprovedUnsupported {readonly method_id: string; readonly reason: string}
export function approvedV1Releases(): {releases: ApprovedRelease[]; unsupported: ApprovedUnsupported[]};
export function formFor(entry: unknown): ApprovedRelease["form"];
