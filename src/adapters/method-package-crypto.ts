import {createHash} from "node:crypto";
import type {MethodPackageHasher} from "../ports/method-artifacts.js";
export function methodPackageHasher():MethodPackageHasher {
  return Object.freeze({sha256:(bytes:Uint8Array)=>createHash("sha256").update(bytes).digest("hex")});
}
