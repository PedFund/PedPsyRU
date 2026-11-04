#!/usr/bin/env node
// МетодТест: статическая проверка входящих Markdown-пакетов. Не выполняет ключи.
"use strict";
const fs = require("node:fs");
const path = require("node:path");

const REQUIRED_SECTIONS = [1,2,3,4,5,6,7,8,9];
function section(text, number) {
  const pattern = new RegExp("^##\\s+"+number+"\\.\\s+[^\\r\\n]*[\\r\\n]([\\s\\S]*?)(?=^##\\s+[1-9]\\.|$(?![\\s\\S]))", "m");
  return (text.match(pattern)||[])[1] || "";
}
function declaredItems(text) {
  const match = section(text,1).match(/\|\s*Пунктов\s*\|\s*(\d+)\s*\|/i);
  return match ? Number(match[1]) : null;
}
function listedItems(text) {
  const form = section(text,4);
  const numbers = [...form.matchAll(/^\s*(\d+)\.\s+\S/gm)].map(m=>Number(m[1]));
  return numbers;
}
function validate(name, contents) {
  const errors=[],warnings=[];
  const keyStatus = (contents.match(/Статус ключа в пакете:\s*`([^`]+)`/)||[])[1] || null;
  const expected=declaredItems(contents);
  const observed=listedItems(contents);
  for (const n of REQUIRED_SECTIONS) {
    if (!section(contents,n).trim()) errors.push("MISSING_SECTION_"+n);
  }
  if (!Number.isInteger(expected) || expected<1) errors.push("MISSING_ITEM_COUNT");
  if (observed.length===0) errors.push("NO_NUMBERED_STIMULI");
  if (observed.length) {
    if (new Set(observed).size !== observed.length) errors.push("DUPLICATE_ITEM_NUMBERS");
    if (observed.some((v,i)=>v!==i+1)) errors.push("NONCONTIGUOUS_ITEM_NUMBERS");
    if (expected !== null && observed.length!==expected) errors.push("ITEM_COUNT_MISMATCH");
  }
  if (!/https:\/\/psytests\.org\//i.test(contents)) warnings.push("NO_PSYTESTS_SOURCE");
  if (!/\b(?:yaml|json)\b/i.test(section(contents,6))) warnings.push("KEY_NOT_MACHINE_READABLE");
  if (/C_NEEDS_VERIFICATION|scoring_ready:\s*false/i.test(contents)) errors.push("UNCONFIRMED_SCORING_KEY");
  if (/число градаций\/диапазон различается|требуется явное правило перекодирования/i.test(section(contents,8))) errors.push("RESPONSE_MAPPING_UNRESOLVED");
  if (/самодостаточный машинный ключ отсутствует/i.test(section(contents,8))) errors.push("EXTERNAL_SCORING_KEY");
  if (/отсутствуют числовые параметры|lookup-таблицы в файле отсутствуют|нет полной официальной таблицы|таблицы преобразования/i.test(section(contents,8))) warnings.push("NORMATIVE_LOOKUP_INCOMPLETE");
  if (/не задано правило обработки пропусков/i.test(section(contents,8))) warnings.push("MISSING_ANSWER_POLICY");
  if (name.startsWith("t01_")||name.startsWith("t02_")) warnings.push("SAME_SCORING_FAMILY_CO36");
  if (name.startsWith("t06_")||name.startsWith("t11_")) warnings.push("SAME_SCORING_FAMILY_FFMQ");
  warnings.push("SCIENTIFIC_AND_LEGAL_REVIEW_REQUIRED");
  return {
    file:name, declared_items:expected, numbered_items:observed.length,
    scoring_status:keyStatus,
    structure_valid:errors.filter(x=>!["UNCONFIRMED_SCORING_KEY","RESPONSE_MAPPING_UNRESOLVED","EXTERNAL_SCORING_KEY"].includes(x)).length===0,
    technically_importable:errors.length===0,
    errors:[...new Set(errors)], warnings:[...new Set(warnings)]
  };
}
function main() {
  const args=process.argv.slice(2);
  const directory=args[0];
  if (!directory || args.includes("--help")) {
    process.stdout.write("Usage: node scripts/validate-psytests-packages.js <folder-with-md> [--out report.json]\\n");
    process.exitCode=directory?0:2;return;
  }
  const outIndex=args.indexOf("--out");
  const output=outIndex>=0 ? args[outIndex+1] : null;
  if (outIndex>=0&&!output) throw new Error("--out requires a file path");
  const files=fs.readdirSync(directory).filter(x=>x.toLowerCase().endsWith(".md")&&x.toLowerCase()!=="readme.md").sort();
  if (!files.length) throw new Error("No method .md files found");
  const checks=files.map(name=>validate(name,fs.readFileSync(path.join(directory,name),"utf8")));
  const report={
    schema_version:"1.0.0", source_directory:path.resolve(directory),
    counts:{files:checks.length,structure_valid:checks.filter(x=>x.structure_valid).length,technically_importable:checks.filter(x=>x.technically_importable).length,blocked:checks.filter(x=>!x.technically_importable).length},
    files:checks
  };
  const serialized=JSON.stringify(report,null,2)+"\n";
  if (output) fs.writeFileSync(output,serialized,"utf8");
  else process.stdout.write(serialized);
  if (report.counts.blocked) process.exitCode=1;
}
if(require.main===module) main();
module.exports={validate,declaredItems,listedItems,section};
