/** Open protocol for trusted method modules. No closed list of test families. */
export type MethodData = null | boolean | number | string | readonly MethodData[] | {readonly [key:string]:MethodData};
export interface MethodRuntimeIdentity {
  readonly contract_version:string;
  readonly method_version_id:string;
  readonly handler_version:string;
  readonly key_digest:string;
}
export interface MethodRuntimeDescriptor extends MethodRuntimeIdentity {
  readonly title:string;
  readonly authors:readonly string[];
  // A host-registered component id/version, never a URL or executable from JSON.
  readonly presentation:{readonly id:string;readonly version:string};
  readonly response_schema:{readonly id:string;readonly version:string};
  readonly result_schema:{readonly id:string;readonly version:string};
  readonly outputs:readonly {readonly id:string;readonly label:string;readonly kind:string}[];
}
export interface MethodDraftCheck {
  readonly valid:boolean;
  readonly complete:boolean;
  readonly issues:readonly string[];
}
/** Functions are installed by the host. Uploaded method metadata cannot supply code. */
export interface MethodRuntimeModule {
  readonly descriptor:MethodRuntimeDescriptor;
  checkDraft(data:MethodData):MethodDraftCheck;
  calculate(data:MethodData):MethodData;
  acceptsResult(result:MethodData):boolean;
  // Explicit projection: keys, private annotations and sources never leak by default.
  participantResult(result:MethodData):MethodData;
}
export interface MethodRuntimeRegistry {
  descriptors():readonly MethodRuntimeDescriptor[];
  describe(identity:MethodRuntimeIdentity):MethodRuntimeDescriptor;
  checkDraft(identity:MethodRuntimeIdentity,data:unknown):MethodDraftCheck;
  calculate(identity:MethodRuntimeIdentity,data:unknown):MethodData;
  participantResult(identity:MethodRuntimeIdentity,result:unknown):MethodData;
}
