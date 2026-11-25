import type {PostgresMethodAuthoring} from "../adapters/postgres/method-authoring.js";
import {ParticipationError} from "../ports/errors.js";
import {validateAuthoringDefinition} from "./authoring-method.js";
export function createMethodAuthoringApi(store:PostgresMethodAuthoring){
  return {
    validate:(input:unknown)=>{const result=validateAuthoringDefinition(input);return {valid:result.valid,errors:result.errors};},
    async publish(token:string,input:unknown){
      const result=validateAuthoringDefinition(input);if(!result.valid||!result.compiled)throw new ParticipationError(400,"INVALID_METHOD_PACKAGE");
      const definition=input as {indicators?:readonly {label?:string}[]};
      const indicators=(definition.indicators??[]).map(indicator=>String(indicator.label??"").trim()).filter(Boolean);
      return store.publish(token,{
        method_id:result.compiled.method_id,method_version_id:result.compiled.method_version_id,
        package_version:result.compiled.package_version,title:result.compiled.title,
        authors:result.compiled.authors,indicators,
        form_snapshot:result.compiled.form_snapshot,key:result.compiled.key,package_json:result.compiled.package_json,
        form_digest:result.compiled.form_digest,key_digest:result.compiled.key_digest,package_digest:result.compiled.package_digest
      });
    }
  };
}
export type MethodAuthoringApi=ReturnType<typeof createMethodAuthoringApi>;
