import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {classifyUiDiff,parseGitNameStatus,hash} from '../scripts/selectel-ui-cd-check.mjs';

test('CSS-only modification is allowed',()=>{
  assert.deepEqual(classifyUiDiff([{status:'M',path:'web/workspace/styles.css'}]),{allowed:true,reason:'CSS_ONLY'});
});
test('mixed changes do not automatically deploy',()=>{
  for(const path of [
    'storage/postgres/122_stage_display_names.sql',
    'src/bootstrap/postgres-server.ts',
    'web/workspace/participant.js',
    'web/workspace/index.html',
    '.github/workflows/selectel-ui-cd.yml',
    'methods/approved/v1/keys/maia_r_32.key.json'
  ]) assert.equal(classifyUiDiff([{status:'M',path:'web/workspace/styles.css'},{status:'M',path}]).allowed,false,path);
});
test('new/deleted CSS and unchanged main are blocked',()=>{
  for(const status of ['A','D','R100','C100']) assert.equal(classifyUiDiff([{status,path:'web/workspace/styles.css'}]).allowed,false);
  assert.equal(classifyUiDiff([]).allowed,false);
});
test('parse Git zero-delimited status lines, and hashes are stable',()=>{
  assert.deepEqual(parseGitNameStatus(Buffer.from('M\0web/workspace/styles.css\0')),[{status:'M',path:'web/workspace/styles.css'}]);
  assert.throws(()=>parseGitNameStatus('M\0'));
  assert.equal(hash(Buffer.from('a')),'ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb');
});
test('remote deployment script parses as bash',()=>{
  execFileSync('bash',['-n','scripts/selectel-ui-remote.sh'],{stdio:'pipe'});
});
