// UI-only CD gate. No network calls or credentials.
import {createHash} from 'node:crypto';
import {execFileSync,spawnSync} from 'node:child_process';
import {appendFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
export const SHA_PATTERN=/^[a-f0-9]{40}$/;
export const CSS_PATH='web/workspace/styles.css';

export function classifyUiDiff(changes) {
  if (!Array.isArray(changes) || changes.length===0) return {allowed:false,reason:'NO_CHANGES'};
  if (changes.length!==1) return {allowed:false,reason:'OTHER_CHANGES_PRESENT'};
  const row=changes[0];
  if (row.status!=='M' || row.path!==CSS_PATH) return {allowed:false,reason:'NOT_CSS_ONLY'};
  return {allowed:true,reason:'CSS_ONLY'};
}
export function parseGitNameStatus(data) {
  const parts=Buffer.isBuffer(data)?data.toString('utf8').split('\0').filter(Boolean):String(data).split('\0').filter(Boolean);
  if (parts.length%2!==0) throw new Error('Invalid -z Git diff');
  const rows=[];
  for(let i=0;i<parts.length;i+=2)rows.push({status:parts[i],path:parts[i+1]});
  return rows;
}
export function hash(buffer){return createHash('sha256').update(buffer).digest('hex');}
function output(k,v){if(process.env.GITHUB_OUTPUT)appendFileSync(process.env.GITHUB_OUTPUT,k+'='+v+'\n');}
export function checkUiDiff(base,head){
  if(!SHA_PATTERN.test(base)||!SHA_PATTERN.test(head))throw new Error('Invalid SHA');
  const ancestor=spawnSync('git',['merge-base','--is-ancestor',base,head],{stdio:'ignore'});
  if(ancestor.status!==0)throw new Error('Deployed SHA is not an ancestor of target SHA');
  const diffs=execFileSync('git',['diff','--name-status','--no-renames','-z',base,head]);
  const changes=parseGitNameStatus(diffs),decision=classifyUiDiff(changes);
  if(!decision.allowed)throw new Error(decision.reason+': '+JSON.stringify(changes));
  const old=execFileSync('git',['show',base+':'+CSS_PATH]);
  const next=execFileSync('git',['show',head+':'+CSS_PATH]);
  if(hash(old)===hash(next))throw new Error('CSS unchanged between commits');
  return {base,head,oldHash:hash(old),newHash:hash(next),changes};
}
if(process.argv[1] && fileURLToPath(import.meta.url)===process.argv[1]){
  const x=checkUiDiff(process.argv[2]||'',process.argv[3]||'');
  output('base_sha',x.base);output('old_css_sha',x.oldHash);output('new_css_sha',x.newHash);
  console.log('Eligible UI-only update:',x.base.slice(0,8),'→',x.head.slice(0,8));
  console.log('File:',CSS_PATH);
  console.log('CSS checksum:',x.oldHash,'→',x.newHash);
}
