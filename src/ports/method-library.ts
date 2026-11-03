import type {MethodHandlerVerification} from "./method-handlers.js";
export interface PreparedMethodDraft {verification:MethodHandlerVerification;artifacts:readonly {id:string;path:string;bytes:Uint8Array}[]}
export interface MethodLibraryRecord {method_id:string;package_version:string;revision:number;package_digest:string;handler_state:"pinned"|"unsupported";blockers:readonly string[];state:"draft"}
export interface CatalogMethod {release_id:string;method_id:string;title:string;authors:readonly string[];indicators:readonly string[];search_terms:readonly string[]}
export interface PlanningMethod {method_id:string;version:string;title:string;authors:readonly string[]|string|null;item_count:number;summary:string;indicators:readonly string[];subscales:readonly string[];outputs:readonly {label:string;value_type:"number"|"text"}[];legacy_scoring_ready:boolean;online_form_present:boolean;search_terms:readonly string[];blank_source:string|null;releases:readonly string[]}
export interface MethodTransferStatus {archived_methods:number;prepared_packages:number;assignable_releases:number;blocked_packages:number;mode:"allowlisted_packages_only"}
export interface MethodLibrary {
  planning(token:string):Promise<readonly PlanningMethod[]>;
  save(token:string,expectedRevision:number,draft:PreparedMethodDraft):Promise<MethodLibraryRecord>;
  list(token:string):Promise<readonly MethodLibraryRecord[]>;
  read(token:string,methodId:string,version:string):Promise<{record:MethodLibraryRecord;package_json:string}>;
  catalog(token:string):Promise<readonly CatalogMethod[]>;
  transferStatus(token:string):Promise<MethodTransferStatus>;
}
