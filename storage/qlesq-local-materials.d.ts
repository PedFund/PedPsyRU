export function qlesqLocalMaterials():{
 pkg:{
  method_id:string;
  items: Array<{id:string;ordinal:number;kind:string;options:Array<{value:string;label:string}>}>;
  scales:Array<{id:string;label:string;min:number;max:number;direction:string}>;
  artifacts:Array<{id:string;path:string;bytes:number;sha256:string;media_type:string}>;
  [key:string]:unknown;
 };
 contents:Array<{id:string;path:string;bytes:Uint8Array}>;
};
