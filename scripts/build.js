"use strict";
const fs = require("node:fs");
const path = require("node:path");
const {execFileSync} = require("node:child_process");
const root = path.resolve(__dirname, "..");
execFileSync(process.execPath, [require.resolve("typescript/bin/tsc"), "--project", path.join(root, "tsconfig.json")], {cwd: root, stdio: "inherit"});
// Copy exactly the unchanged first-party JS scorer/data required by its imports.
// No database, credentials, node_modules, HTTP pilot or reports are copied.
for (const file of ["core/tki-contract.js", "core/approved-v1-data.js", "storage/approved-v1-data.js", "core/approved-v1-contract.js", "storage/approved-v1-release.js", "storage/releases.js", "core/prfq-contract.js", "core/legacy-batch-data.js", "core/legacy-batch-contract.js", "storage/legacy-batch-release.js", "methods/batch/manifest.json", "methods/batch/fras_ru_34_gusarova_2021/form-local.json", "methods/batch/fras_ru_34_gusarova_2021/key-local.json", "methods/batch/fras_ru_34_gusarova_2021/package-local.json", "methods/batch/ffmq_39_yumartova_grishina/form-local.json", "methods/batch/ffmq_39_yumartova_grishina/key-local.json", "methods/batch/ffmq_39_yumartova_grishina/package-local.json", "methods/batch/parental_anxiety_prikhozhan_40/form-local.json", "methods/batch/parental_anxiety_prikhozhan_40/key-local.json", "methods/batch/parental_anxiety_prikhozhan_40/package-local.json", "methods/batch/fad_r_53_sadovnikova/form-local.json", "methods/batch/fad_r_53_sadovnikova/key-local.json", "methods/batch/fad_r_53_sadovnikova/package-local.json", "methods/batch/faces_iv_62/form-local.json", "methods/batch/faces_iv_62/key-local.json", "methods/batch/faces_iv_62/package-local.json", "methods/batch/fhs_lf_32_ru/form-local.json", "methods/batch/fhs_lf_32_ru/key-local.json", "methods/batch/fhs_lf_32_ru/package-local.json", "methods/batch/odrev_zakharova_66/form-local.json", "methods/batch/odrev_zakharova_66/key-local.json", "methods/batch/odrev_zakharova_66/package-local.json", "methods/batch/sspm_2020_28/form-local.json", "methods/batch/sspm_2020_28/key-local.json", "methods/batch/sspm_2020_28/package-local.json", "methods/batch/gses_10/form-local.json", "methods/batch/gses_10/key-local.json", "methods/batch/gses_10/package-local.json", "core/umics-contract.js", "core/numeric-passport.js", "methods/umics/form-local.json", "methods/umics/key-local.json", "methods/umics/pins.json", "storage/umics-release.js", "methods/prfq/form-local.json", "methods/prfq/key-local.json", "methods/prfq/pins.json", "methods/prfq/norms-local.json", "methods/prfq/norm-applicability.txt", "storage/prfq-release.js", "core/karpov-contract.js", "methods/karpov/form-local.json", "methods/karpov/keys/1.0.0-local.json", "storage/karpov-release.js", "methods/karpov/norms-local.json", "methods/karpov/norm-applicability.txt", "processor.js", "methods.js", "methods/builtin.js", "methods/tki/keys/1.0.0.json",
  "methods/tki/form.json", "storage/releases.js", "storage/database.js", "storage/access.js", "web/workspace/method-presenters.js", "web/workspace/index.html", "web/workspace/app.js", "web/workspace/method-search.js", "web/workspace/styles.css"]) {
  const target = path.join(root, "dist", file);
  fs.mkdirSync(path.dirname(target), {recursive: true});
  fs.copyFileSync(path.join(root, file), target);
}
// Approved-library content (packages and generated keys) is public method data:
// no databases, credentials, local configuration or respondent rows live there.
const approvedSource = path.join(root, "methods", "approved", "v1");
const copyTree = source => {
  for (const entry of fs.readdirSync(source, {withFileTypes: true})) {
    const from = path.join(source, entry.name);
    if (entry.isDirectory()) { copyTree(from); continue; }
    const to = path.join(root, "dist", path.relative(root, from));
    fs.mkdirSync(path.dirname(to), {recursive: true});
    fs.copyFileSync(from, to);
  }
};
copyTree(approvedSource);
console.log("Strict TypeScript build complete; original scoring files copied byte-for-byte.");
