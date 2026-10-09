import type {MethodArtifactIntegrity} from "./method-artifacts.js";
import type {MethodPackage} from "./method-package.js";

// Trusted host code only: submission JSON cannot supply a registry or executable.
export interface PinnedMethodHandler {
  readonly method_version_id:string;
  readonly handler_version:string;
  readonly key_digest:string;
  run(responses:readonly Readonly<{item_id:string;value:string|number}>[]):readonly Readonly<{scale_id:string;value:number}>[];
}
export interface MethodHandlerRegistry {
  resolve(pkg:Readonly<MethodPackage>,evidence:MethodArtifactIntegrity["evidence"]):PinnedMethodHandler|null;
}
export interface MethodHandlerVerification extends MethodArtifactIntegrity {
  handler:Readonly<{state:"unsupported"|"pinned";method_version_id:string|null;handler_version:string|null;key_digest:string|null;
    checked_vectors:readonly Readonly<{id:string;basis:"independent"|"legacy_regression"}>[]}>;
}
