import {createHash} from "node:crypto";
import type {InstrumentResponse} from "../ports/instruments.js";
export function instrumentResponsesDigest(ids:readonly string[],responses:readonly InstrumentResponse[]):string{
 if(new Set(ids).size!==ids.length||new Set(responses.map(r=>r.item_id)).size!==responses.length||responses.some(r=>!ids.includes(r.item_id)||typeof r.value!=="string"))throw Error("INVALID_RESPONSES");
 const values=new Map(responses.map(r=>[r.item_id,r.value]));
 return "sha256:"+createHash("sha256").update(JSON.stringify(ids.filter(id=>values.has(id)).map(item_id=>({item_id,value:values.get(item_id)})))).digest("hex");
}
