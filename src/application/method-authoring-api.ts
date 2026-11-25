import {ParticipationError} from "../ports/errors.js";
interface Compiled {method_id:string;method_version_id:string;package_version:string;title:string;authors:readonly string[];form_snapshot:unknown;key:unknown;package_json:string;form_digest:string;key_digest:string;package_digest:string}
export interface AuthoringCompiler {validate(input:unknown):{valid:boolean;errors:string[];compiled:Compiled|null}}
export interface AuthoringStore {publish(token:string,proof:string,input:Record<string,unknown>):Promise<{release_id:string;method_id:string;method_version_id:string;form_digest:string;key_digest:string}>}
export function createMethodAuthoringApi(store:AuthoringStore,compiler:AuthoringCompiler){
  return {
    validate:(input:unknown)=>{const result=compiler.validate(input);return {valid:result.valid,errors:result.errors};},
    async publish(token:string,proof:string,input:unknown){
      const result=compiler.validate(input);if(!result.valid||!result.compiled)throw new ParticipationError(400,"INVALID_METHOD_PACKAGE");
      const definition=input as {indicators?:readonly {label?:string}[]};
      const indicators=(definition.indicators??[]).map(indicator=>String(indicator.label??"").trim()).filter(Boolean);
      const compiled=result.compiled;
      return store.publish(token,proof,{
        method_id:compiled.method_id,method_version_id:compiled.method_version_id,package_version:compiled.package_version,
        title:compiled.title,authors:compiled.authors,indicators,form_snapshot:compiled.form_snapshot,key:compiled.key,
        package_json:compiled.package_json,form_digest:compiled.form_digest,key_digest:compiled.key_digest,package_digest:compiled.package_digest
      });
    }
  };
}
export type MethodAuthoringApi=ReturnType<typeof createMethodAuthoringApi>;
