// Conservative, dependency-free policy for experimental autonomy.
// This policy is a narrow allowlist, not an AI judgement.
export function evaluateAutonomy({pr, files, mainSha, protectedMain, ciPassed, independentApproval}) {
  const reasons = [];
  const labels = (pr.labels || []).map(x => typeof x === 'string' ? x : x.name);
  if (pr.base?.ref !== 'main' || pr.base?.sha !== mainSha) reasons.push('base is not the current main');
  if (pr.draft || pr.state !== 'open' || pr.mergeable !== true || pr.mergeable_state !== 'clean') reasons.push('PR is not clean and mergeable');
  if (pr.head?.repo?.full_name !== pr.base?.repo?.full_name || !pr.head?.ref?.startsWith('agent/')) reasons.push('head must be an agent/ branch in this repository');
  if (!labels.includes('autonomy:auto-merge')) reasons.push('missing autonomy:auto-merge label');
  if (!labels.includes('autonomy:reviewed')) reasons.push('missing autonomy:reviewed label');
  if (!protectedMain) reasons.push('main is not protected');
  if (!ciPassed) reasons.push('exact-head CI is not successful');
  if (!independentApproval) reasons.push('missing independent approval for exact head');
  if (!Array.isArray(files) || files.length < 1 || files.length > 5) {
    reasons.push('file count outside the allowlist');
  } else {
    let total = 0;
    for (const f of files) {
      total += f.additions || 0;
      // UI styling and UI documentation only. No JS/HTML/backend/db/workflows.
      if (!/^web\/workspace\/[^/]+\.css$/.test(f.filename) && !/^docs\/ui\/[a-zA-Z0-9_-]+\.md$/.test(f.filename)) {
        reasons.push('blocked path: ' + f.filename);
      }
      if (f.status !== 'modified' && f.status !== 'added') reasons.push('blocked file operation: ' + f.filename);
      if (f.changes > 150 || f.patch == null) reasons.push('too large or missing patch: ' + f.filename);
      if (f.filename.endsWith('.css') && /^\+[^+].*(?:@import\b|url\s*\(|expression\s*\(|behavior\s*:|-moz-binding\s*:)/im.test(f.patch || '')) {
        reasons.push('unsafe CSS added in: ' + f.filename);
      }
    }
    if (total > 250) reasons.push('addition count exceeds 250');
  }
  return {allowed:reasons.length === 0,reasons};
}
