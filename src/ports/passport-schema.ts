// Passport questions are metadata, not psychometric instruments or scores.
interface Field {readonly key:string;readonly label:string;readonly required:boolean}
export type PassportField =
  | (Field & {readonly kind:"text";readonly max_length:number})
  | (Field & {readonly kind:"integer";readonly min:number;readonly max:number})
  | (Field & {readonly kind:"single_choice";readonly options:readonly {readonly value:string;readonly label:string}[]});
export interface PassportSchema {
  readonly study_id:string;readonly study_version:number;readonly schema_version:number;
  readonly frozen:boolean;readonly fields:readonly PassportField[];
}
export interface PassportSchemaInput {
  readonly expected_version:number;readonly expected_schema_version:number;
  readonly basic_required:{readonly city:boolean};
  readonly additional_fields:readonly PassportField[];
}
export interface PassportSchemas {
  read(token:string,studyId:string):Promise<PassportSchema>;
  configure(token:string,studyId:string,input:PassportSchemaInput):Promise<PassportSchema>;
}
