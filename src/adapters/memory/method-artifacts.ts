import type {MethodArtifactReader} from "../../ports/method-artifacts.js";
import {ParticipationError} from "../../ports/errors.js";

// Bounded host staging, NOT an authentication or upload endpoint. No OS paths,
// archives, symlinks, network requests or browser storage are read here.
export class ScopedMemoryMethodArtifacts implements MethodArtifactReader {
  readonly #entries=new Map<string,{path:string;bytes:Uint8Array}>();
  readonly #methodId:string;
  readonly #packageVersion:string;
  constructor(methodId:string,packageVersion:string,
    contents:readonly {id:string;path:string;bytes:Uint8Array}[]) {
    this.#methodId=methodId;this.#packageVersion=packageVersion;
    if(contents.length>32)throw new ParticipationError(400,"INVALID_METHOD_ARTIFACT_STAGE");
    const paths=new Set<string>();let total=0;
    for(const entry of contents){
      if(!(entry.bytes instanceof Uint8Array)||entry.bytes.byteLength<1||entry.bytes.byteLength>1048576||this.#entries.has(entry.id)||paths.has(entry.path))throw new ParticipationError(400,"INVALID_METHOD_ARTIFACT_STAGE");
      total+=entry.bytes.byteLength;if(total>8388608)throw new ParticipationError(400,"INVALID_METHOD_ARTIFACT_STAGE");
      paths.add(entry.path);this.#entries.set(entry.id,{path:entry.path,bytes:new Uint8Array(entry.bytes)});
    }
    Object.freeze(this);
  }
  async read(input:Parameters<MethodArtifactReader["read"]>[0]):Promise<Uint8Array|null> {
    if(input.method_id!==this.#methodId||input.package_version!==this.#packageVersion)return null;
    const found=this.#entries.get(input.artifact.id);
    return found?.path===input.artifact.path?new Uint8Array(found.bytes):null;
  }
}
