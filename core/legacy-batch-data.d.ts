export interface BatchEntry {
 id:string;title:string;authors:string[];search:string[];itemCount:number;valid:string[];
 outputs:{id:string;label:string}[];pins:{form:string;key:string};hasNorms:boolean;hasCriteria:boolean;
 form:{id:string;version:string;method_id:string;title:string;language:string;instruction:string;items:{id:string;number:number;text:string;options:{value:string;text:string}[]}[]};
 key:unknown;pkg:unknown;
}
export const entries:BatchEntry[];
