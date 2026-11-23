// GitHub-hosted autonomy gate. Runs on the trusted main branch, never checks out
// or executes untrusted PR code. Opt-in is disabled by default.
import {appendFileSync} from 'node:fs';
import {evaluateAutonomy} from './autonomy-policy.mjs';

const token=process.env.GH_TOKEN;
const slug=process.env.GITHUB_REPOSITORY;
if (!token || !/^[-\w]+\/[-\w.]+$/.test(slug || '')) throw new Error('GitHub token/repository missing');
const prefix='https://api.github.com/repos/'+slug;
async function api(path,options={}) {
  const result=await fetch(prefix+path,{
    ...options,headers:{
      'Accept':'application/vnd.github+json',
      'Authorization':'Bearer '+token,
      'X-GitHub-Api-Version':'2022-11-28',
      'Content-Type':'application/json',
      ...(options.headers||{})
    }
  });
  const body=await result.text();
  if (!result.ok) throw new Error('GitHub API '+result.status+' '+path+' '+body.slice(0,200));
  return body ? JSON.parse(body) : null;
}
const requiredJobs=new Set(['Tests (Node 22)','Tests (Node 24)','Dependency audit','Secret scan','PostgreSQL 18 isolation','Required checks']);
async function greenExactHead(pr) {
  const response=await api('/actions/runs?event=pull_request&head_sha='+encodeURIComponent(pr.head.sha)+'&per_page=50');
  const run=(response.workflow_runs||[]).find(r=>r.path==='.github/workflows/ci.yml' && r.head_sha===pr.head.sha && r.conclusion==='success' && (r.pull_requests||[]).some(p=>p.number===pr.number));
  if (!run) return false;
  const jobs=await api('/actions/runs/'+run.id+'/jobs?per_page=100');
  const ok=new Set((jobs.jobs||[]).filter(j=>j.conclusion==='success').map(j=>j.name));
  return [...requiredJobs].every(name=>ok.has(name));
}
async function approvedExactHead(pr) {
  const reviews=await api('/pulls/'+pr.number+'/reviews?per_page=100');
  const latest=new Map();
  for (const r of reviews) {
    if (!r.user?.login) continue;
    latest.set(r.user.login,r);
  }
  return [...latest.values()].some(r=>r.state==='APPROVED' && r.commit_id===pr.head.sha && r.user.login!==pr.user.login);
}
function output(line) {
  console.log(line);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY,line+'\n');
}
const mode=process.env.AUTONOMY_MODE || 'report';
const enabled=process.env.AUTONOMY_AUTOMERGE_ENABLED==='true';
const mergeRequested=(mode==='merge'||mode==='scheduled')&&enabled;
const branch=await api('/branches/main');
const all=await api('/pulls?state=open&base=main&per_page=100');
const candidates=all.filter(p=>(p.labels||[]).some(l=>l.name==='autonomy:auto-merge'));
output('## Autonomy gate: '+(mergeRequested?'MERGE ENABLED':'REPORT ONLY'));
output('main: '+branch.commit.sha+'; protected: '+Boolean(branch.protected));
if (all.length===100) output('WARNING: 100 PR page limit reached; inspect pagination manually');
if (!candidates.length) output('No labeled agent PRs. Existing PRs are untouched.');
for (const partial of candidates) {
  const pr=await api('/pulls/'+partial.number);
  const fileResponse=await api('/pulls/'+pr.number+'/files?per_page=100');
  const files=fileResponse.length===100 ? [] : fileResponse;
  const ciPassed=await greenExactHead(pr);
  const independentApproval=await approvedExactHead(pr);
  const decision=evaluateAutonomy({pr,files,mainSha:branch.commit.sha,protectedMain:branch.protected,ciPassed,independentApproval});
  output('PR #'+pr.number+': '+(decision.allowed?'eligible':'BLOCKED')+'; '+(decision.reasons.join('; ')||'all gates passed'));
  if (!decision.allowed || !mergeRequested) continue;
  await api('/pulls/'+pr.number+'/merge',{method:'PUT',body:JSON.stringify({sha:pr.head.sha,merge_method:'squash',commit_title:'autonomy: '+pr.title})});
  output('MERGED PR #'+pr.number+' at exact SHA '+pr.head.sha);
  break; // Stop after one merge: subsequent PRs need fresh CI against updated main.
}
