import {createHash} from "node:crypto";
import {canonicalJson} from "../../storage/releases.js";
import type {InstrumentRequest,InstrumentResult} from "../ports/instruments.js";

export const AUTHORING_HANDLER = "authoring-numeric-1.0.0";
export const AUTHORING_TYPE = "single_choice_numeric";
export interface AuthoringLabel {value:number;label:string}
export interface AuthoringAnswerScale {minimum:number;maximum:number;step:number;has_labels:boolean;labels?:readonly AuthoringLabel[]}
export interface AuthoringQuestion {id:string;text:string;reverse?:boolean}
export interface AuthoringIndicator {code:string;label:string;items:readonly string[];aggregate:"sum"|"mean";precision?:number}
export interface AuthoringLevel {from:number;to:number;label:string}
export interface AuthoringMethod {code:string;title:string;short_title?:string;authors:readonly string[];instruction:string;description?:string;language?:string;source_note?:string;rights_confirmed:boolean}
export interface AuthoringDefinition {
  readonly schema_version:1;
  readonly type:"single_choice_numeric";
  readonly method:AuthoringMethod;
  readonly answer_scale:AuthoringAnswerScale;
  readonly questions:readonly AuthoringQuestion[];
  readonly indicators:readonly AuthoringIndicator[];
  readonly levels:Readonly<Record<string,readonly AuthoringLevel[]>>;
}
export interface AuthoringKey {
  readonly id:string;
  readonly key_version:string;
  readonly type:"passport";
  readonly items:number;
  readonly valid:readonly string[];
  readonly answerMap:Readonly<Record<string,number>>;
  readonly reverseMin:number;
  readonly reverseMax:number;
  readonly scoreRange:readonly [number,number];
  readonly scales:Readonly<Record<string,{direct:readonly number[];reverse?:readonly number[];aggregate:"sum"|"mean";label?:string}>>;
  readonly levels:Readonly<Record<string,readonly [number,number,string][]>>;
}
export interface AuthoringCompiled {
  readonly method_id:string;
  readonly method_version_id:string;
  readonly package_version:string;
  readonly form_id:string;
  readonly form_version:string;
  readonly title:string;
  readonly short_title:string;
  readonly authors:readonly string[];
  readonly instruction:string;
  readonly description:string;
  readonly source_note:string;
  readonly language:string;
  readonly form_snapshot:unknown;
  readonly key:AuthoringKey;
  readonly package_json:string;
  readonly form_digest:string;
  readonly key_digest:string;
  readonly package_digest:string;
}
const CODE=/^[a-z][a-z0-9_]{1,63}$/;
const CONTROL=/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const plain=(value:unknown,min:number,max:number,label:string,errors:string[]):string=>{
  if(typeof value!=="string"){errors.push(label+": требуется текст");return "";}
  const text=value.trim();
  if(text.length<min||text.length>max){errors.push(label+": длина от "+min+" до "+max);return text;}
  if(CONTROL.test(text))errors.push(label+": недопустимые управляющие символы");
  return text;
};
const finite=(value:unknown,label:string,errors:string[]):number=>{
  const number=Number(value);
  if(!Number.isFinite(number))errors.push(label+": требуется число");
  return number;
};
const integer=(value:unknown,min:number,max:number,label:string,errors:string[]):number=>{
  const number=finite(value,label,errors);
  if(!Number.isInteger(number)||number<min||number>max)errors.push(label+": целое от "+min+" до "+max);
  return number;
};
function digest(value:unknown):string{return "sha256:"+createHash("sha256").update(canonicalJson(value)).digest("hex");}

export function validateAuthoringDefinition(raw:unknown):{valid:boolean;errors:string[];compiled:AuthoringCompiled|null}{
  const errors:string[]=[];
  if(!raw||typeof raw!=="object"||Array.isArray(raw))return {valid:false,errors:["Некорректный объект методики"],compiled:null};
  const input=raw as Partial<AuthoringDefinition>;
  if(input.schema_version!==1||input.type!==AUTHORING_TYPE)errors.push("Поддерживается только тип single_choice_numeric");
  const method=input.method;
  if(!method||typeof method!=="object")return {valid:false,errors:[...errors,"Не заполнен паспорт методики"],compiled:null};
  const code=plain(method.code,2,64,"Код методики",errors);
  if(!CODE.test(code))errors.push("Код методики: латиница, цифры, подчёркивание; начинается с буквы");
  const title=plain(method.title,1,200,"Название",errors);
  const shortTitle=method.short_title===undefined?title:plain(method.short_title,1,40,"Краткое название",errors);
  const instruction=plain(method.instruction,1,8000,"Инструкция",errors);
  const description=method.description===undefined?"":plain(method.description,0,2000,"Описание",errors);
  const sourceNote=method.source_note===undefined?"":plain(method.source_note,0,500,"Источник",errors);
  const language=method.language===undefined?"ru":plain(method.language,2,12,"Язык",errors);
  const authors=Array.isArray(method.authors)?method.authors.map(author=>plain(author,1,120,"Автор",errors)).filter(Boolean):[];
  if(!authors.length)errors.push("Укажите хотя бы одного автора");
  if(method.rights_confirmed!==true)errors.push("Подтвердите права и источник методики");

  const scale=input.answer_scale;
  if(!scale||typeof scale!=="object")return {valid:false,errors:[...errors,"Не задана шкала ответов"],compiled:null};
  const minimum=integer(scale.minimum,-10000,10000,"Минимум ответа",errors);
  const maximum=integer(scale.maximum,-10000,10000,"Максимум ответа",errors);
  const step=integer(scale.step,1,1000,"Шаг ответа",errors);
  if(maximum<=minimum)errors.push("Максимум должен быть больше минимума");
  if(step>0&&(maximum-minimum)%step!==0)errors.push("Разница максимума и минимума должна делиться на шаг");
  const count=step>0?Math.floor((maximum-minimum)/step)+1:0;
  if(count<2||count>10)errors.push("Количество вариантов ответа должно быть от 2 до 10");
  const hasLabels=scale.has_labels===true;
  const labels:AuthoringLabel[]=[];
  if(hasLabels){
    if(!Array.isArray(scale.labels)||scale.labels.length!==count)errors.push("Подписи должны быть заданы для каждого варианта");
    else for(let index=0;index<count;index++){
      const label=scale.labels[index];
      const expected=minimum+index*step;
      if(!label||Number(label.value)!==expected)errors.push("Подпись ответа не совпадает со значением "+expected);
      labels.push({value:expected,label:plain(label?.label,1,300,"Подпись ответа",errors)});
    }
  }
  const questions=Array.isArray(input.questions)?input.questions:[];
  if(questions.length<1||questions.length>150)errors.push("Количество вопросов должно быть от 1 до 150");
  const questionIds=new Set<string>(),normalizedQuestions:AuthoringQuestion[]=[];
  questions.forEach((question,index)=>{
    if(!question||typeof question!=="object"){errors.push("Вопрос "+(index+1)+": некорректный объект");return;}
    const text=plain(question.text,1,3000,"Вопрос "+(index+1),errors);
    const id="q"+String(index+1).padStart(2,"0");
    if(question.id!==undefined&&question.id!==id)errors.push("Вопрос "+(index+1)+": ID должен быть "+id);
    if(questionIds.has(id))errors.push("Дубликат вопроса "+id);questionIds.add(id);
    normalizedQuestions.push({id,text,reverse:question.reverse===true});
  });
  const indicators=Array.isArray(input.indicators)?input.indicators:[];
  if(indicators.length<1||indicators.length>30)errors.push("Количество показателей должно быть от 1 до 30");
  const codes=new Set<string>(),normalizedIndicators:AuthoringIndicator[]=[];
  for(const [index,indicator] of indicators.entries()){
    if(!indicator||typeof indicator!=="object"){errors.push("Показатель "+(index+1)+": некорректный объект");continue;}
    const indicatorCode=plain(indicator.code,2,64,"Код показателя "+(index+1),errors);
    if(!CODE.test(indicatorCode))errors.push("Код показателя "+(index+1)+": латиница, цифры, подчёркивание");
    if(codes.has(indicatorCode))errors.push("Дубликат кода показателя "+indicatorCode);codes.add(indicatorCode);
    const label=plain(indicator.label,1,200,"Название показателя "+(index+1),errors);
    const source=indicator.items as readonly unknown[]|undefined;
    const items:string[]=Array.isArray(source)?[...new Set(source.filter((item):item is string=>typeof item==="string"))]:[];
    if(!items.length)errors.push("Показатель «"+label+"»: выберите вопросы");
    for(const item of items)if(!questionIds.has(item))errors.push("Показатель «"+label+"»: неизвестный вопрос "+item);
    const aggregate=indicator.aggregate==="sum"||indicator.aggregate==="mean"?indicator.aggregate:"sum";
    if(indicator.aggregate!=="sum"&&indicator.aggregate!=="mean")errors.push("Показатель «"+label+"»: расчёт sum или mean");
    const precision=indicator.precision===undefined?2:integer(indicator.precision,0,4,"Точность показателя "+label,errors);
    normalizedIndicators.push({code:indicatorCode,label,items,aggregate,precision});
  }
  const covered=new Set(normalizedIndicators.flatMap(indicator=>indicator.items));
  for(const question of questionIds)if(!covered.has(question))errors.push("Вопрос "+question+" не входит ни в один показатель");

  const levelsInput=input.levels&&typeof input.levels==="object"&&!Array.isArray(input.levels)?input.levels:{};
  const normalizedLevels:Record<string,[number,number,string][]>={};
  for(const indicator of normalizedIndicators){
    const list:readonly AuthoringLevel[]=Array.isArray(levelsInput[indicator.code])?(levelsInput[indicator.code] as readonly AuthoringLevel[]):[];
    if(!list.length){errors.push("Показатель «"+indicator.label+"»: задайте уровни");continue;}
    const ranges:Array<[number,number,string]>=[];
    for(const [index,level] of list.entries()){
      if(!level||typeof level!=="object"){errors.push("Уровень "+(index+1)+" показателя «"+indicator.label+"»: некорректный объект");continue;}
      const from=finite(level.from,"Нижняя граница уровня",errors),to=finite(level.to,"Верхняя граница уровня",errors);
      const label=plain(level.label,1,200,"Название уровня",errors);
      if(to<from)errors.push("Уровень «"+label+"»: верхняя граница меньше нижней");
      ranges.push([from,to,label]);
    }
    ranges.sort((left,right)=>left[0]-right[0]);
    const scoreMin=indicator.aggregate==="mean"?minimum:minimum*indicator.items.length;
    const scoreMax=indicator.aggregate==="mean"?maximum:maximum*indicator.items.length;
    if(ranges[0]&&ranges[0][0]>scoreMin)errors.push("Показатель «"+indicator.label+"»: первый уровень не покрывает минимум "+scoreMin);
    if(ranges.at(-1)&&ranges.at(-1)![1]<scoreMax)errors.push("Показатель «"+indicator.label+"»: последний уровень не покрывает максимум "+scoreMax);
    for(let index=1;index<ranges.length;index++){
      const previous=ranges[index-1]!,current=ranges[index]!;
      if(current[0]<=previous[1])errors.push("Показатель «"+indicator.label+"»: уровни пересекаются");
      else if(current[0]>previous[1]+1)errors.push("Показатель «"+indicator.label+"»: разрыв между уровнями");
    }
    normalizedLevels[indicator.code]=ranges;
  }
  if(errors.length)return {valid:false,errors:[...new Set(errors)],compiled:null};

  const methodId="authoring_"+code;
  const methodVersionId=methodId+"@1.0.0";
  const formId=methodId+"_shared";
  const optionTexts=hasLabels?labels.map(label=>label.label):Array.from({length:count},(_,index)=>String(minimum+index*step));
  const options=optionTexts.map((text,index)=>({value:String(index+1),text}));
  const formSnapshot={
    id:formId,version:"1.0.0",title,instruction,
    presentation:{id:"pedpsy/single-choice",version:"1.0"},
    items:normalizedQuestions.map((question,index)=>({id:question.id,number:index+1,text:question.text,options}))
  };
  const answerMap:Record<string,number>={};
  for(let index=0;index<count;index++)answerMap[String(index+1)]=minimum+index*step;
  const scales:Record<string,{direct:number[];reverse:number[];aggregate:"sum"|"mean";label:string}>={};
  for(const indicator of normalizedIndicators){
    scales[indicator.code]={
      direct:indicator.items.filter(item=>!normalizedQuestions.find(question=>question.id===item)?.reverse).map(item=>Number(item.slice(1))),
      reverse:indicator.items.filter(item=>normalizedQuestions.find(question=>question.id===item)?.reverse).map(item=>Number(item.slice(1))),
      aggregate:indicator.aggregate,
      label:indicator.label
    };
  }
  const key:AuthoringKey={id:methodId,key_version:"1.0.0",type:"passport",items:normalizedQuestions.length,
    valid:Array.from({length:count},(_,index)=>String(index+1)),answerMap,reverseMin:minimum,reverseMax:maximum,
    scoreRange:[minimum,maximum],scales,levels:normalizedLevels};
  const packageJson=canonicalJson({
    schema_version:"1.0",method_id:methodId,package_version:"1.0.0",title,language,
    provenance:{authors},instruction:{text:instruction},items:formSnapshot.items,scales:normalizedIndicators.map(indicator=>({id:indicator.code,label:indicator.label,min:indicator.aggregate==="mean"?minimum:minimum*indicator.items.length,max:indicator.aggregate==="mean"?maximum:maximum*indicator.items.length,direction:"not_specified"})),
    calculation:{kind:"special",adapter_id:AUTHORING_HANDLER,adapter_version:"1.0.0"},
    artifacts:[],review:{technical:"unverified",scientific:"draft",publication:"draft"}
  });
  const compiled:AuthoringCompiled={method_id:methodId,method_version_id:methodVersionId,package_version:"1.0.0",
    form_id:formId,form_version:"1.0.0",title,short_title:shortTitle,authors,instruction,description,source_note:sourceNote,
    language: normalizedQuestions.length?language:"ru",form_snapshot:formSnapshot,key,package_json:packageJson,
    form_digest:digest(formSnapshot),key_digest:digest(key),package_digest:createHash("sha256").update(packageJson).digest("hex")};
  return {valid:true,errors:[],compiled};
}

export function scoreAuthoringNumeric(input:InstrumentRequest,key:AuthoringKey):InstrumentResult {
  const base:InstrumentResult={contract_version:"1.0",method_version_id:input.method_version_id,handler_version:AUTHORING_HANDLER,
    status:"invalid",validation_state:"key_verified",quality:{valid_response_count:0,complete:false,usable_for_aggregation:false},
    measures:[],classifications:[],warnings:[],calculation:{algorithm_id:AUTHORING_HANDLER,key_digest:""}};
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
    const directValues=scale.direct.map(index=>adjusted[index]!);
    const values=[...directValues,...(scale.reverse||[]).map(index=>key.reverseMin+key.reverseMax-adjusted[index]!)];
    if(!values.length)continue;
    const value=scale.aggregate==="sum"?values.reduce((sum,item)=>sum+item,0):values.reduce((sum,item)=>sum+item,0)/values.length;
    const label=scale.label||code;
    base.measures.push({code,label,value,value_type:"number",representation:"raw",precision:2});
    const ranges=key.levels[code]||[];
    const level=ranges.find(([from,to])=>value>=from&&value<=to);
    base.classifications.push({code:code+"_level",label:label+" — уровень",value:level?level[2]:"Не определён",basis:"authoring_contract"});
  }
  return base;
}
export function authoringKeyDigest(key:AuthoringKey):string{return digest(key);}
