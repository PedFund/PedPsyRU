import type {
  ResearchResultsExport, ResultExportParticipant, ResultExportProfileField,
  ResultExportMeasure, ResultExportClassification, ResultExportResponse
} from "../ports/research-workbench.js";

const CONSENT_LABELS:Record<string,string>={
  contact_processing:"Обработка персональных данных",
  study_participation:"Участие в исследовании",
  secondary_research:"Дополнительное научное использование"
};
type CellValue=string|number|null;
interface Column {
  readonly header:string;
  readonly kind:"base"|"indicator"|"measure"|"question";
  readonly value:(participant:ResultExportParticipant)=>CellValue;
}
interface MethodExport {
  readonly id:string;
  readonly title:string;
  readonly classifications:readonly ResultExportClassification[];
  readonly measures:readonly ResultExportMeasure[];
  readonly responses:readonly ResultExportResponse[];
}
function text(value:unknown):string{
  if(value===null||value===undefined)return "";
  if(typeof value==="string")return value;
  if(typeof value==="number"||typeof value==="boolean")return String(value);
  if(Array.isArray(value))return value.map(text).join(", ");
  if(typeof value==="object")return JSON.stringify(value);
  return String(value);
}
function optionLabel(field:ResultExportProfileField,value:unknown):string{
  const direct=text(value);
  const options=field.options??[];
  return options.find(option=>option.value===direct)?.label??direct;
}
function profileValue(participant:ResultExportParticipant,key:string):string{
  const field=participant.profile?.fields?.find(item=>item.key===key);
  return field?optionLabel(field,participant.profile?.values?.[key]):"";
}
function profileColumns(participants:readonly ResultExportParticipant[]):Column[]{
  const fields=new Map<string,{label:string;field:ResultExportProfileField}>();
  for(const participant of participants)for(const field of participant.profile?.fields??[]){
    if(!fields.has(field.key))fields.set(field.key,{label:field.label,field});
  }
  const labels=new Set<string>();
  const out:Column[]=[];
  for(const [key,item] of fields){
    let header=item.label;
    if(labels.has(header))header=header+" ("+key+")";
    labels.add(header);
    out.push({header,kind:"base",value:participant=>profileValue(participant,key)});
  }
  return out;
}
function consentColumns(participants:readonly ResultExportParticipant[]):Column[]{
  const purposes=new Set<string>();
  for(const participant of participants)for(const consent of participant.consents??[])purposes.add(consent.purpose);
  const ordered=["contact_processing","study_participation","secondary_research"].filter(purpose=>purposes.has(purpose));
  for(const purpose of purposes)if(!ordered.includes(purpose))ordered.push(purpose);
  return ordered.map(purpose=>({header:"Согласие: "+(CONSENT_LABELS[purpose]??purpose),kind:"base" as const,
    value:participant=>participant.consents?.some(consent=>consent.purpose===purpose)?"Да":"Нет"}));
}
function methods(participants:readonly ResultExportParticipant[]):MethodExport[]{
  const map=new Map<string,MethodExport>();
  for(const participant of participants)for(const result of participant.results??[]){
    if(map.has(result.method_id))continue;
    map.set(result.method_id,{id:result.method_id,title:result.method_title||result.method_id,
      classifications:result.classifications??[],measures:result.measures??[],responses:result.responses??[]});
  }
  return [...map.values()].sort((left,right)=>left.title.localeCompare(right.title,"ru")||left.id.localeCompare(right.id));
}
function resultFor(participant:ResultExportParticipant,methodId:string){
  return participant.results?.find(result=>result.method_id===methodId);
}
function methodColumns(method:MethodExport):Column[]{
  const columns:Column[]=[
    {header:"ID участника",kind:"base",value:participant=>participant.participant_id},
    ...method.classifications.map((classification,index)=>({
      header:"Индикатор: "+(classification.label||classification.code||String(index+1)),
      kind:"indicator" as const,
      value:(participant:ResultExportParticipant)=>{
        const result=resultFor(participant,method.id);
        const row=result?.classifications?.[index];
        return row?text(row.value):"";
      }
    })),
    {header:"Пол",kind:"base",value:participant=>profileValue(participant,"sex")},
    {header:"Возраст",kind:"base",value:participant=>profileValue(participant,"age")},
    ...method.measures.map((measure,index)=>({
      header:"Показатель: "+(measure.label||measure.code||String(index+1)),
      kind:"measure" as const,
      value:(participant:ResultExportParticipant)=>{
        const result=resultFor(participant,method.id);
        const row=result?.measures?.[index];
        if(!row)return "";
        return typeof row.value==="number"?row.value:text(row.value);
      }
    })),
    ...method.responses.map((response,index)=>({
      header:"Вопрос "+(response.ordinal||index+1)+": "+(response.label||response.item_id),
      kind:"question" as const,
      value:(participant:ResultExportParticipant)=>{
        const result=resultFor(participant,method.id);
        const answer=result?.responses?.find(item=>item.item_id===response.item_id);
        return answer?text(answer.value):"";
      }
    }))
  ];
  return columns;
}
function passportColumns(participants:readonly ResultExportParticipant[]):Column[]{
  return [
    {header:"ID участника",kind:"base",value:participant=>participant.participant_id},
    ...profileColumns(participants),
    ...consentColumns(participants)
  ];
}
function csvCell(value:CellValue):string{
  const raw=value===null?"":String(value);
  return /[";\r\n]/.test(raw)?"\""+raw.replace(/"/g,"\"\"")+"\"":raw;
}
export function resultsCsv(data:ResearchResultsExport):string{
  const participants=data.participants??[];
  const flat=methods(participants).flatMap(method=>methodColumns(method).slice(1).map(column=>({
    header:method.title+" — "+column.header,value:column.value
  })));
  const cols=[{header:"ID участника",value:(participant:ResultExportParticipant)=>participant.participant_id},...profileColumns(participants),...consentColumns(participants),...flat];
  const lines=[cols.map(column=>csvCell(column.header)).join(";")];
  for(const participant of participants)lines.push(cols.map(column=>csvCell(column.value(participant))).join(";"));
  return "\uFEFF"+lines.join("\r\n")+"\r\n";
}

const crcTable=(()=>{
  const table=new Uint32Array(256);
  for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;table[n]=c>>>0;}
  return table;
})();
function crc32(buffer:Buffer):number{
  let crc=0xffffffff;
  for(const byte of buffer)crc=crcTable[(crc^byte)&0xff]!^(crc>>>8);
  return (crc^0xffffffff)>>>0;
}
interface ZipEntry {readonly name:string;readonly data:Buffer}
function zipStore(entries:readonly ZipEntry[]):Buffer{
  const chunks:Buffer[]=[],central:Buffer[]=[];let offset=0;
  for(const entry of entries){
    const name=Buffer.from(entry.name,"utf8"),data=entry.data,crc=crc32(data);
    const local=Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);local.writeUInt16LE(0x0800,6);local.writeUInt16LE(0,8);
    local.writeUInt16LE(0,10);local.writeUInt16LE(0,12);local.writeUInt32LE(crc,14);local.writeUInt32LE(data.length,18);
    local.writeUInt32LE(data.length,22);local.writeUInt16LE(name.length,26);local.writeUInt16LE(0,28);
    chunks.push(local,name,data);
    const entryCentral=Buffer.alloc(46);
    entryCentral.writeUInt32LE(0x02014b50,0);entryCentral.writeUInt16LE(20,4);entryCentral.writeUInt16LE(20,6);entryCentral.writeUInt16LE(0x0800,8);
    entryCentral.writeUInt16LE(0,10);entryCentral.writeUInt16LE(0,12);entryCentral.writeUInt16LE(0,14);entryCentral.writeUInt32LE(crc,16);
    entryCentral.writeUInt32LE(data.length,20);entryCentral.writeUInt32LE(data.length,24);entryCentral.writeUInt16LE(name.length,28);
    entryCentral.writeUInt16LE(0,30);entryCentral.writeUInt16LE(0,32);entryCentral.writeUInt16LE(0,34);entryCentral.writeUInt16LE(0,36);
    entryCentral.writeUInt32LE(0,38);entryCentral.writeUInt32LE(offset,42);
    central.push(entryCentral,name);
    offset+=local.length+name.length+data.length;
  }
  const centralSize=central.reduce((sum,chunk)=>sum+chunk.length,0),end=Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(0,4);end.writeUInt16LE(0,6);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);
  end.writeUInt32LE(centralSize,12);end.writeUInt32LE(offset,16);end.writeUInt16LE(0,20);
  return Buffer.concat([...chunks,...central,end]);
}
function xml(value:string):string{
  return value.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,"");
}
function columnLetter(index:number):string{
  let value=index+1,out="";
  while(value>0){const rest=(value-1)%26;out=String.fromCharCode(65+rest)+out;value=Math.floor((value-1)/26);}
  return out;
}
function cell(ref:string,value:CellValue,style:number):string{
  if(value===null||value==="")return "";
  if(typeof value==="number"&&Number.isFinite(value))return '<c r="'+ref+'" s="'+style+'"><v>'+value+"</v></c>";
  return '<c r="'+ref+'" s="'+style+'" t="inlineStr"><is><t xml:space="preserve">'+xml(String(value))+"</t></is></c>";
}
function sheetXml(columns:readonly Column[],participants:readonly ResultExportParticipant[]):string{
  const rows:string[]=[];
  const header=columns.map((column,index)=>cell(columnLetter(index)+"1",column.header,column.kind==="indicator"?2:column.kind==="base"?1:3)).join("");
  rows.push('<row r="1">'+header+"</row>");
  participants.forEach((participant,rowIndex)=>{
    const row=columns.map((column,columnIndex)=>cell(columnLetter(columnIndex)+(rowIndex+2),column.value(participant),column.kind==="indicator"?4:5)).join("");
    rows.push('<row r="'+(rowIndex+2)+'">'+row+"</row>");
  });
  const widths=columns.map((column,index)=>{
    const length=Math.max(column.header.length,...participants.map(participant=>text(column.value(participant)).length));
    return '<col min="'+(index+1)+'" max="'+(index+1)+'" width="'+Math.min(42,Math.max(10,length+2))+'" customWidth="1"/>';
  }).join("");
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'+
    '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'+
    '<cols>'+widths+'</cols><sheetData>'+rows.join("")+'</sheetData>'+
    '<autoFilter ref="A1:'+columnLetter(Math.max(0,columns.length-1))+'1"/></worksheet>';
}
function safeSheetName(title:string,used:Set<string>):string{
  let base=title.replace(/\s*\([^)]*\)/g,"").replace(/[\\/*?:[\]]/g," ").replace(/'+$/,"").trim()||"Методика";
  if(base.length>31)base=base.slice(0,31).trim();
  let name=base,index=2;
  while(used.has(name.toLowerCase())){const suffix=" "+index++;name=base.slice(0,Math.max(1,31-suffix.length))+suffix;}
  used.add(name.toLowerCase());
  return name;
}
export async function resultsXlsx(data:ResearchResultsExport):Promise<Buffer>{
  const participants=data.participants??[],used=new Set<string>(["паспортичка"]);
  const sheets=[{name:"Паспортичка",columns:passportColumns(participants)},
    ...methods(participants).map(method=>({name:safeSheetName(method.title,used),columns:methodColumns(method)}))];
  const sheetFiles=sheets.map((sheet,index)=>({
    name:"xl/worksheets/sheet"+(index+1)+".xml",data:Buffer.from(sheetXml(sheet.columns,participants),"utf8")
  }));
  const contentTypes='<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'+
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'+
    '<Default Extension="xml" ContentType="application/xml"/>'+
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'+
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'+
    sheets.map((_,index)=>'<Override PartName="/xl/worksheets/sheet'+(index+1)+'.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join("")+
    "</Types>";
  const rootRels='<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';
  const workbook='<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'+
    sheets.map((sheet,index)=>'<sheet name="'+xml(sheet.name)+'" sheetId="'+(index+1)+'" r:id="rId'+(index+1)+'"/>').join("")+"</sheets></workbook>";
  const workbookRels='<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+
    sheets.map((_,index)=>'<Relationship Id="rId'+(index+1)+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet'+(index+1)+'.xml"/>').join("")+
    '<Relationship Id="rId'+(sheets.length+1)+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>';
  const styles='<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'+
    '<fonts count="4"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>'+
    '<fills count="5"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE8EEF2"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFF2CC"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFDDEBF7"/></patternFill></fill></fills>'+
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'+
    '<cellXfs count="6"><xf/><xf fontId="1" fillId="2" applyFont="1" applyFill="1"><alignment vertical="center" wrapText="1"/></xf><xf fontId="1" fillId="3" applyFont="1" applyFill="1"><alignment vertical="center" wrapText="1"/></xf><xf fontId="1" fillId="4" applyFont="1" applyFill="1"><alignment vertical="center" wrapText="1"/></xf><xf fontId="3" fillId="3" applyFont="1" applyFill="1"><alignment vertical="top" wrapText="1"/></xf><xf applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs></styleSheet>';
  return zipStore([
    {name:"[Content_Types].xml",data:Buffer.from(contentTypes,"utf8")},
    {name:"_rels/.rels",data:Buffer.from(rootRels,"utf8")},
    {name:"xl/workbook.xml",data:Buffer.from(workbook,"utf8")},
    {name:"xl/_rels/workbook.xml.rels",data:Buffer.from(workbookRels,"utf8")},
    {name:"xl/styles.xml",data:Buffer.from(styles,"utf8")},
    ...sheetFiles
  ]);
}
