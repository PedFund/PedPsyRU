export interface ProtocolSummary{attempt_id:string;study_id:string;study_title:string;participant_code:string;status:string;has_result:boolean}
export interface StaffProtocol{
  attempt_id:string;study_id:string;group_id:string;stage_id:string;participant_code:string;status:string;revision:number;current_item_id:string;
  release:{id:string;method_version_id:string;handler_version:string;contract_version:string;form_version:string};
  responses:{item_id:string;value:"A"|"B"}[];
  result:null|{id:string;input_revision:number;responses_digest:string;calculated_at:string;measures:{code:string;label:string;value:number;representation:string}[]};
}
export interface DiagnosticSnapshot{schema_version:"pedpsy.staff-protocols.v1";dataset_kind:"demo";record_count:number;protocols:StaffProtocol[]}
export interface StaffDiagnostics{
  list(token:string):Promise<ProtocolSummary[]>;
  read(token:string,id:string):Promise<StaffProtocol>;
  download(token:string,id?:string):Promise<DiagnosticSnapshot>;
}
