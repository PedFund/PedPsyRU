import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateAutonomy} from '../scripts/autonomy-policy.mjs';

const valid = () => ({
  mainSha:'base123',protectedMain:true,ciPassed:true,independentApproval:true,
  pr:{
    state:'open',draft:false,mergeable:true,mergeable_state:'clean',
    base:{ref:'main',sha:'base123',repo:{full_name:'PedFund/PedPsyRU'}},
    head:{ref:'agent/ui-spacing',sha:'head123',repo:{full_name:'PedFund/PedPsyRU'}},
    labels:[{name:'autonomy:auto-merge'},{name:'autonomy:reviewed'}]
  },
  files:[{filename:'web/workspace/styles.css',status:'modified',additions:10,changes:12,patch:'@@ -1 +1 @@\n-.a{}\n+.a{padding:1rem}'}]
});

test('conservative gate permits small reviewed CSS-only PR on protected main',()=>{
  assert.equal(evaluateAutonomy(valid()).allowed,true);
});
test('blocks unprotected main',()=>{
  const c=valid();c.protectedMain=false;
  assert.equal(evaluateAutonomy(c).allowed,false);
});
test('blocks API, method keys, migrations, CI changes and JS',()=>{
  for (const filename of ['src/http/admission-routes.ts','storage/postgres/126_test.sql','methods/approved/v1/keys/maia_r_32.key.json','.github/workflows/ci.yml','web/workspace/app.js']) {
    const c=valid();c.files[0].filename=filename;
    assert.equal(evaluateAutonomy(c).allowed,false,filename);
  }
});
test('blocks unsafe CSS and stale or unreviewed PRs',()=>{
  for (const patch of ['+@import "https://example.invalid/style.css";','+.x{background:url(https://example.invalid/a)}','+.x{behavior:url(x)}']) {
    const c=valid();c.files[0].patch=patch;
    assert.equal(evaluateAutonomy(c).allowed,false,patch);
  }
  const stale=valid();stale.pr.base.sha='old';assert.equal(evaluateAutonomy(stale).allowed,false);
  const ci=valid();ci.ciPassed=false;assert.equal(evaluateAutonomy(ci).allowed,false);
  const review=valid();review.independentApproval=false;assert.equal(evaluateAutonomy(review).allowed,false);
  const fork=valid();fork.pr.head.repo.full_name='attacker/other';assert.equal(evaluateAutonomy(fork).allowed,false);
});
