import type {
  ResearchResultsExport, ResultExportParticipant, ResultExportProfileField,
  ResultExportMeasure, ResultExportClassification
} from "../ports/research-workbench.js";

const CONSENT_LABELS:Record<string,string>={
  contact_processing:"Обработка персональных данных",
  study_participation:"Участие в исследовании",
  secondary_research:"Дополнительное научное использование"
};
interface ExportColumn {
  readonly header:string;
  readonly group:string|null;
  readonly kind:"base"|"indicator"|"raw";
  readonly value:(participant:ResultExportParticipant)=>string|number|null;
}
interface MethodExport {
  readonly id:string;
  readonly title:string;
  readonly classifications:readonly ResultExportClassification[];
  readonly measures:readonly ResultExportMeasure[];
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
function profileColumns(participants:readonly ResultExportParticipant[]):ExportColumn[]{
  const fields=new Map<string,{label:string;field:ResultExportProfileField}>();
  for(const participant of participants)for(const field of participant.profile?.fields??[]){
    if(!fields.has(field.key))fields.set(field.key,{label:field.label,field});
  }
  const labels=new Set<string>();
  const out:ExportColumn[]=[];
  for(const [key,item] of fields){
    let header=item.label;
    if(labels.has(header))header=header+" ("+key+")";
    labels.add(header);
    out.push({header,group:null,kind:"base",value:participant=>{
      const field=participant.profile?.fields?.find(value=>value.key===key)??item.field;
      return optionLabel(field,participant.profile?.values?.[key]);
    }});
  }
  return out;
}
function consentColumns(participants:readonly ResultExportParticipant[]):ExportColumn[]{
  const purposes=new Set<string>();
  for(const participant of participants)for(const consent of participant.consents??[])purposes.add(consent.purpose);
  const ordered=["contact_processing","study_participation","secondary_research"].filter(purpose=>purposes.has(purpose));
  for(const purpose of purposes)if(!ordered.includes(purpose))ordered.push(purpose);
  return ordered.map(purpose=>({header:"Согласие: "+(CONSENT_LABELS[purpose]??purpose),group:null,kind:"base" as const,
    value:participant=>participant.consents?.some(consent=>consent.purpose===purpose)?"Да":"Нет"}));
}
function methods(participants:readonly ResultExportParticipant[]):MethodExport[]{
  const map=new Map<string,MethodExport>();
  for(const participant of participants)for(const result of participant.results??[]){
    if(map.has(result.method_id))continue;
    map.set(result.method_id,{id:result.method_id,title:result.method_title||result.method_id,
      classifications:result.classifications??[],measures:result.measures??[]});
  }
  return [...map.values()].sort((left,right)=>left.title.localeCompare(right.title,"ru")||left.id.localeCompare(right.id));
}
function methodColumns(method:MethodExport):ExportColumn[]{
  const classify:ExportColumn[]=method.classifications.map((classification,index)=>({
    header:"Показатель: "+(classification.label||classification.code||String(index+1)),
    group:method.title,kind:"indicator" as const,
    value:participant=>{
      const result=participant.results?.find(value=>value.method_id===method.id);
      const row=result?.classifications?.[index];
      return row?text(row.value):"";
    }
  }));
  const measures:ExportColumn[]=method.measures.map((measure,index)=>({
    header:"Сырой балл: "+(measure.label||measure.code||String(index+1)),
    group:method.title,kind:"raw" as const,
    value:participant=>{
      const result=participant.results?.find(value=>value.method_id===method.id);
      const row=result?.measures?.[index];
      if(!row)return "";
      return typeof row.value==="number"?row.value:text(row.value);
    }
  }));
  return [...classify,...measures];
}
function columns(participants:readonly ResultExportParticipant[]):ExportColumn[]{
  return [
    {header:"ID участника",group:null,kind:"base",value:participant=>participant.participant_id},
    ...profileColumns(participants),
    ...consentColumns(participants),
    ...methods(participants).flatMap(methodColumns)
  ];
}
function csvCell(value:string|number|null):string{
  const raw=value===null?"":String(value);
  return /[";\r\n]/.test(raw)?"\""+raw.replace(/"/g,"\"\"")+"\"":raw;
}
export function resultsCsv(data:ResearchResultsExport):string{
  const participants=data.participants??[];
  const cols=columns(participants);
  const lines=[cols.map(column=>csvCell(column.group?column.group+" — "+column.header:column.header)).join(";")];
  for(const participant of participants)lines.push(cols.map(column=>csvCell(column.value(participant))).join(";"));
  return "\uFEFF"+lines.join("\r\n")+"\r\n";
}
function xml(value:string|number|null):string{
  const raw=value===null?"":String(value);
  return raw.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,"");
}
// SpreadsheetML 2003 opens natively in Excel and supports fills, merges and frozen panes
// without adding a runtime Zip/XLSX dependency.
export function resultsExcel(data:ResearchResultsExport):string{
  const participants=data.participants??[];
  const cols=columns(participants);
  const baseColumns=cols.filter(column=>column.group===null);
  const methodGroups=methods(participants).map(method=>({method,columns:methodColumns(method)}));
  const widths=cols.map(column=>{
    const values=participants.map(participant=>text(column.value(participant)).length);
    return Math.min(240,Math.max(70,Math.max(column.header.length,...values)*7+12));
  });
  const rows:string[]=[];
  const baseHeaderCells=baseColumns.map(column=>'<Cell ss:MergeDown="1" ss:StyleID="BaseHeader"><Data ss:Type="String">'+xml(column.header)+"</Data></Cell>").join("");
  const groupCells=methodGroups.map(item=>'<Cell ss:MergeAcross="'+(item.columns.length-1)+'" ss:StyleID="MethodHeader"><Data ss:Type="String">'+xml(item.method.title)+"</Data></Cell>").join("");
  rows.push("<Row ss:Height=\"30\">"+baseHeaderCells+groupCells+"</Row>");
  const detailCells=methodGroups.flatMap(item=>item.columns.map(column=>'<Cell ss:StyleID="'+(column.kind==="indicator"?"IndicatorHeader":"RawHeader")+'"><Data ss:Type="String">'+xml(column.header)+"</Data></Cell>")).join("");
  rows.push('<Row ss:Height="36">'+baseColumns.map(()=>"<Cell/>").join("")+detailCells+"</Row>");
  for(const participant of participants){
    const cells=cols.map(column=>{
      const value=column.value(participant);
      const style=column.kind==="indicator"?' ss:StyleID="Indicator"':"";
      return typeof value==="number"?('<Cell'+style+'><Data ss:Type="Number">'+value+"</Data></Cell>"):('<Cell'+style+'><Data ss:Type="String">'+xml(value)+"</Data></Cell>");
    }).join("");
    rows.push("<Row>"+cells+"</Row>");
  }
  const columnsXml=widths.map(width=>'<Column ss:Width="'+width+'"/>').join("");
  const lastRow=participants.length+2,lastCol=cols.length;
  return '<?xml version="1.0" encoding="UTF-8"?>'+
    '<?mso-application progid="Excel.Sheet"?>'+
    '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet" xmlns:x="urn:schemas-microsoft-com:office:excel">'+
    '<Styles>'+
    '<Style ss:ID="Default"><Alignment ss:Vertical="Top" ss:WrapText="1"/></Style>'+
    '<Style ss:ID="BaseHeader"><Font ss:Bold="1"/><Interior ss:Color="#E8EEF2" ss:Pattern="Solid"/><Alignment ss:Vertical="Center" ss:WrapText="1"/></Style>'+
    '<Style ss:ID="MethodHeader"><Font ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#167A83" ss:Pattern="Solid"/><Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/></Style>'+
    '<Style ss:ID="IndicatorHeader"><Font ss:Bold="1"/><Interior ss:Color="#FFF2CC" ss:Pattern="Solid"/><Alignment ss:Vertical="Center" ss:WrapText="1"/></Style>'+
    '<Style ss:ID="RawHeader"><Font ss:Bold="1"/><Interior ss:Color="#DDEBF7" ss:Pattern="Solid"/><Alignment ss:Vertical="Center" ss:WrapText="1"/></Style>'+
    '<Style ss:ID="Indicator"><Font ss:Bold="1"/><Interior ss:Color="#FFF9E6" ss:Pattern="Solid"/><Alignment ss:Vertical="Top" ss:WrapText="1"/></Style>'+
    '</Styles>'+
    '<Worksheet ss:Name="Результаты"><Table>'+columnsXml+rows.join("")+'</Table>'+
    '<WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel"><FreezePanes/><FrozenNoSplit/><SplitHorizontal>2</SplitHorizontal><TopRowBottomPane>2</TopRowBottomPane><ActivePane>2</ActivePane></WorksheetOptions>'+
    '<AutoFilter x:Range="R1C1:R'+lastRow+'C'+lastCol+'" xmlns="urn:schemas-microsoft-com:office:excel"/>'+
    '</Worksheet></Workbook>';
}
