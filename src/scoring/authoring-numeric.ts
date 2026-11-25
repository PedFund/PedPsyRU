import type {InstrumentRequest,InstrumentResult} from "../ports/instruments.js";
interface Key {
  readonly items:number;
  readonly answerMap:Readonly<Record<string,number>>;
  readonly reverseMin:number;
  readonly reverseMax:number;
  readonly scales:Readonly<Record<string,{direct:readonly number[];reverse?:readonly number[];aggregate:"sum"|"mean"}>>;
  readonly levels:Readonly<Record<string,readonly [number,number,string][]>>;
}
export function scoreAuthoringNumeric(input:InstrumentRequest,key:Key,keyDigest:string):InstrumentResult {
  const base:InstrumentResult={contract_version:"1.0",method_version_id:input.method_version_id,handler_version:"authoring-numeric-1.0.0",
    status:"invalid",validation_state:"key_verified",quality:{valid_response_count:0,complete:false,usable_for_aggregation:false},
    measures:[],classifications:[],warnings:[],calculation:{algorithm_id:"authoring-numeric-1.0.0",key_digest:keyDigest}};
  const byId=new Map(input.responses.map(response=>[response.item_id,response.value]));
  if(byId.size!==input.responses.length||input.responses.length!==key.items)return base;
  const adjusted:Record<number,number>={};
  for(let index=1;index<=key.items;index++){
    const value=byId.get("q"+String(index).padStart(2,"0"));
    const answer=value===undefined?undefined:key.answerMap[value];
    if(!Number.isFinite(answer))return base;
    adjusted[index]=answer!;
  }
  base.quality={valid_response_count:input.responses.length,complete:true,usable_for_aggregation:true};
  base.status="scored";
  for(const [code,scale] of Object.entries(key.scales)){
    const direct=scale.direct.map(index=>adjusted[index]!);
    const values=[...direct,...(scale.reverse||[]).map(index=>key.reverseMin+key.reverseMax-adjusted[index]!)];
    if(!values.length)continue;
    const value=scale.aggregate==="sum"?values.reduce((sum,item)=>sum+item,0):values.reduce((sum,item)=>sum+item,0)/values.length;
    base.measures.push({code,label:code,value,value_type:"number",representation:"raw",precision:2});
    const level=(key.levels[code]||[]).find(([from,to])=>value>=from&&value<=to);
    base.classifications.push({code:code+"_level",label:code+" — уровень",value:level?level[2]:"Не определён",basis:"authoring_contract"});
  }
  return base;
}
