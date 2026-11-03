export interface InstrumentResponse {readonly item_id:string;readonly value:"A"|"B"|"1"|"2"|"3"|"4"|"5"|"6"|"7"}
export interface InstrumentRequest {readonly contract_version:string;readonly method_version_id:string;readonly handler_version:string;readonly responses:readonly InstrumentResponse[]}
export interface InstrumentResult {
 contract_version:string;method_version_id:string;handler_version:string;status:"invalid"|"blocked"|"incomplete"|"error"|"scored";
 validation_state:"key_verified"|"legacy_checked";
 quality:{valid_response_count:number;complete:boolean;usable_for_aggregation:boolean};
 measures:{code:string;label:string;value:number;value_type:"number";representation:"raw"|"sten"|"stanine";precision:number}[];
 classifications:unknown[];warnings:{code:string;severity:"error"|"warning";details:Record<string,unknown>}[];
 calculation:{algorithm_id:string;key_digest:string};
}
