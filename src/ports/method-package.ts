// Submission data is never authority to approve or publish a method.
export interface MethodArtifact {
  id:string;path:string;bytes:number;sha256:string;
  media_type:"application/json"|"text/markdown"|"text/plain";
}
export type MethodItem =
  {id:string;ordinal:number;kind:"single_choice";options:{value:string;label:string}[]} |
  {id:string;ordinal:number;kind:"integer"|"number";min:number;max:number};
export interface MethodPackage {
  schema_version:"1.0";method_id:string;package_version:string;title:string;language:string;
  provenance:{origin:"existing_processor"|"owner_materials"|"new_sources";
    sources:{id:string;citation:string;url:string|null}[];missing:string[]};
  rights:{status:"unknown"|"evidence_supplied";source_ids:string[]};
  instruction:{artifact_id:string|null};form:{artifact_id:string|null;version:string|null};items:MethodItem[];
  scales:{id:string;label:string;min:number|null;max:number|null;
    direction:"higher"|"lower"|"not_specified"}[];
  calculation:{kind:"sum"|"reverse_sum"|"forced_choice"|"profile"|"special";
    adapter_id:string|null;adapter_version:string|null;specification_artifact_id:string|null;key_artifact_id:string|null};
  norms:{status:"absent"|"evidence_supplied";artifact_id:string|null;
    applicability_artifact_id:string|null;source_ids:string[]};
  control_vectors:{id:string;data_origin:"synthetic";
    responses:{item_id:string;value:string|number}[];expected:{scale_id:string;value:number}[];
    basis:{kind:"independent"|"legacy_regression";source_ids:string[]}}[];
  artifacts:MethodArtifact[];
  review:{technical:"unverified";scientific:"draft";publication:"draft"};
}
export interface MethodPackageValidation {
  status:"structurally_valid_draft";package:Readonly<MethodPackage>;
  blockers:readonly string[];publishable:false;
}
