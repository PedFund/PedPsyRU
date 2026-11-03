'use strict';
const manifest=require('../methods/batch/manifest.json');
const data=[
 {form:require('../methods/batch/fras_ru_34_gusarova_2021/form-local.json'),key:require('../methods/batch/fras_ru_34_gusarova_2021/key-local.json'),pkg:require('../methods/batch/fras_ru_34_gusarova_2021/package-local.json')},
 {form:require('../methods/batch/ffmq_39_yumartova_grishina/form-local.json'),key:require('../methods/batch/ffmq_39_yumartova_grishina/key-local.json'),pkg:require('../methods/batch/ffmq_39_yumartova_grishina/package-local.json')},
 {form:require('../methods/batch/parental_anxiety_prikhozhan_40/form-local.json'),key:require('../methods/batch/parental_anxiety_prikhozhan_40/key-local.json'),pkg:require('../methods/batch/parental_anxiety_prikhozhan_40/package-local.json')},
 {form:require('../methods/batch/fad_r_53_sadovnikova/form-local.json'),key:require('../methods/batch/fad_r_53_sadovnikova/key-local.json'),pkg:require('../methods/batch/fad_r_53_sadovnikova/package-local.json')},
 {form:require('../methods/batch/faces_iv_62/form-local.json'),key:require('../methods/batch/faces_iv_62/key-local.json'),pkg:require('../methods/batch/faces_iv_62/package-local.json')},
 {form:require('../methods/batch/fhs_lf_32_ru/form-local.json'),key:require('../methods/batch/fhs_lf_32_ru/key-local.json'),pkg:require('../methods/batch/fhs_lf_32_ru/package-local.json')},
 {form:require('../methods/batch/odrev_zakharova_66/form-local.json'),key:require('../methods/batch/odrev_zakharova_66/key-local.json'),pkg:require('../methods/batch/odrev_zakharova_66/package-local.json')},
 {form:require('../methods/batch/sspm_2020_28/form-local.json'),key:require('../methods/batch/sspm_2020_28/key-local.json'),pkg:require('../methods/batch/sspm_2020_28/package-local.json')},
 {form:require('../methods/batch/gses_10/form-local.json'),key:require('../methods/batch/gses_10/key-local.json'),pkg:require('../methods/batch/gses_10/package-local.json')}
];
if(manifest.length!==data.length||manifest.some((m,i)=>m.id!==data[i].form.method_id||m.id!==data[i].key.id||m.id!==data[i].pkg.method_id))throw Error('BATCH_REGISTRY_MISMATCH');
module.exports={entries:manifest.map((m,i)=>({...m,...data[i]}))};
