import type {MethodArtifact,MethodPackageValidation} from "./method-package.js";

// Host-supplied dependencies, never accepted from a submission or request DTO.
export interface MethodArtifactReader {
  read(input:Readonly<{method_id:string;package_version:string;artifact:Readonly<MethodArtifact>}>):Promise<Uint8Array|null>;
}
export interface MethodPackageHasher {sha256(bytes:Uint8Array):string}
export interface MethodArtifactIntegrity extends MethodPackageValidation {
  evidence:Readonly<{format:"canonical-json-v1";package_digest:string;
    checked:readonly Readonly<{artifact_id:string;path:string;bytes:number;sha256:string}>[]}>;
}
