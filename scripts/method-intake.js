'use strict';
// Method intake: report what a raw package already contains and what is missing.
// Check mode never writes: it only prints findings so the owner can decide.
const fs = require('node:fs');
const path = require('node:path');

const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const ITEM_ID = /^q\d{2,3}$/;

function itemNumbers(scales) {
  const numbers = [];
  const push = value => { if (Number.isInteger(value)) numbers.push(value); };
  if (Array.isArray(scales)) {
    for (const scale of scales) {
      for (const value of scale.direct_items || scale.items || []) push(value);
      for (const value of scale.reverse_items || []) push(value);
    }
  } else if (scales && typeof scales === 'object') {
    for (const scale of Object.values(scales)) {
      if (Array.isArray(scale)) { for (const value of scale) push(value); continue; }
      for (const value of (scale && (scale.items || scale.direct_items)) || []) push(value);
      for (const value of (scale && scale.reverse_items) || []) push(value);
    }
  }
  return numbers;
}

function checkPackage(file) {
  const pkg = JSON.parse(fs.readFileSync(file, 'utf8'));
  const findings = [];
  const notes = [];
  const items = Array.isArray(pkg.items) ? pkg.items : [];

  if (!SEMVER.test(String(pkg.version || ''))) findings.push(`версия не semver: ${JSON.stringify(pkg.version)}`);

  const ids = items.map(item => item && item.id);
  const expected = items.map((_, index) => 'q' + String(index + 1).padStart(2, '0'));
  if (ids.join(',') !== expected.join(',')) {
    const bad = ids.findIndex((id, index) => id !== expected[index]);
    findings.push(`идентификаторы пунктов нарушены, первый сбой: q-позиция ${bad + 1} = ${JSON.stringify(ids[bad])}`);
  }

  const declared = Array.isArray(pkg.response_options) ? pkg.response_options : [];
  const optionText = option => option ? (option.label ?? option.text ?? (option.display_score !== undefined ? String(option.display_score) : undefined)) : undefined;
  const labelled = declared.length > 0 && declared.every(option => typeof optionText(option) === 'string' && String(optionText(option)).trim());
  const ranked = pkg.scoring && pkg.scoring.response && Array.isArray(pkg.scoring.response.valid);
  const integerScale = pkg.response_format && pkg.response_format.type === 'integer' && Number.isInteger(pkg.response_format.max) && Number.isInteger(pkg.response_format.min);
  if (!declared.length && !ranked && !integerScale) findings.push('нет вариантов ответа: ни response_options, ни scoring.response.valid');
  if (!declared.length && integerScale) notes.push(`целочисленная шкала ${pkg.response_format.min}–${pkg.response_format.max}: подписи — сами числа`);
  else if (declared.length && !labelled) findings.push('варианты ответа без подписей');

  const numbers = itemNumbers(pkg.scales || (pkg.scoring && (pkg.scoring.scales || pkg.scoring.assignment)));
  if (!numbers.length) notes.push('в пакете нет списков шкал — ключ придётся собирать отдельно');
  else {
    const seen = new Map();
    for (const number of numbers) seen.set(number, (seen.get(number) || 0) + 1);
    const missing = items.map((_, index) => index + 1).filter(number => !seen.has(number));
    const doubled = [...seen].filter(([, count]) => count > 1).map(([number]) => number);
    if (missing.length) findings.push(`пункты вне шкал: ${missing.slice(0, 8).join(', ')}${missing.length > 8 ? '…' : ''}`);
    // A total scale legitimately repeats subscale items, so overlap is reported, not rejected.
    if (doubled.length) notes.push(`пункты входят в несколько шкал: ${doubled.length} (нормально для суммарных шкал)`);
  }

  const instruction = typeof pkg.instructions === 'string' ? pkg.instructions.trim() : '';
  if (!instruction) findings.push('инструкции нет в пакете — нужен текст владельца (или коррекция представления)');
  const quota = pkg.scoring && (pkg.scoring.approved_quota || pkg.scoring.quota);
  if (quota) notes.push(`квота: ${JSON.stringify(quota)}`);
  if (pkg.missing_item_text_count) findings.push(`пунктов без текста: ${pkg.missing_item_text_count}`);
  const rights = pkg.review && pkg.review.publication_rights;
  if (rights && rights !== 'documented') notes.push(`права: ${rights}`);

  return {id: pkg.id || path.basename(file), file: path.basename(file), items: items.length, findings, notes};
}

function main() {
  const args = process.argv.slice(2);
  const check = args.includes('--check');
  const targets = args.filter(arg => !arg.startsWith('--'));
  if (!check || !targets.length) {
    console.log('usage: node scripts/method-intake.js --check <package.json> [more packages]');
    process.exit(2);
  }
  const files = targets.flatMap(target => fs.statSync(target).isDirectory()
    ? fs.readdirSync(target).filter(name => name.endsWith('.json')).map(name => path.join(target, name))
    : [target]);
  let blocked = 0;
  for (const file of files) {
    const report = checkPackage(file);
    const state = report.findings.length ? 'БЛОКЕРЫ' : 'готов';
    console.log(`\n${report.id}  (${report.file}, пунктов: ${report.items}) — ${state}`);
    for (const finding of report.findings) console.log(`  ! ${finding}`);
    for (const note of report.notes) console.log(`  · ${note}`);
    if (report.findings.length) blocked++;
  }
  console.log(`\nитого пакетов: ${files.length}, с блокерами: ${blocked}`);
}

main();
