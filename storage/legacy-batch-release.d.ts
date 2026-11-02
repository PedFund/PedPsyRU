import type {BatchEntry} from "../core/legacy-batch-data.js";
export function legacyBatchReleases():Array<BatchEntry&{formSnapshot:string;formDigest:string;keyDigest:string;methodVersionId:string;handlerVersion:string;verificationState:string}>;
