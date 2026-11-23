"use strict";
// Owner-approved FFMQ-39 enhancement (Issue #203).
// A separate, pure calculation helper. Do not overwrite the pinned 1.0.0 key or
// use this helper for historical attempts. The next version must opt into it.
const {scoreNumericPassport}=require("./numeric-passport.js");
const historicalKey=require("../methods/approved/v1/keys/ffmq_39.key.json");

const APPROVED_INTERVALS=Object.freeze({
  observe:Object.freeze({p25:22,p75:29}),
  describe:Object.freeze({p25:28,p75:35}),
  aware_action:Object.freeze({p25:23,p75:30}),
  nonjudging:Object.freeze({p25:23,p75:33}),
  nonreactivity:Object.freeze({p25:18,p75:24}),
  total_5:Object.freeze({p25:121.5,p75:144}),
  total_4:Object.freeze({p25:96,p75:118})
});
const CATEGORY=Object.freeze({
  below:"Ниже нормативного интервала",
  within:"В нормативном интервале",
  above:"Выше нормативного интервала"
});
const TOTAL_FOUR=Object.freeze(["describe","aware_action","nonjudging","nonreactivity"]);
const NOTE="Предварительные нормативные интервалы P25–P75, не клинические и не диагностические пороги.";

function classifyFfmqInterval(code,value){
  const range=APPROVED_INTERVALS[code];
  if(!range||!Number.isFinite(value))throw Error("FFMQ_NORM_INPUT_INVALID");
  if(value<range.p25)return CATEGORY.below;
  if(value>range.p75)return CATEGORY.above;
  return CATEGORY.within;
}

function scoreFfmqWithApprovedIntervals(responses){
  const base=scoreNumericPassport(historicalKey,responses);
  const metrics={...base.metrics};
  // All original 39 items, the five original scales, and their scoring directions
  // are preserved. In particular items 4 and 28 are NOT excluded.
  metrics.total_4=TOTAL_FOUR.reduce((sum,code)=>sum+metrics[code],0);
  for(const code of Object.keys(APPROVED_INTERVALS))
    metrics[code+" – нормативный интервал"]=classifyFfmqInterval(code,metrics[code]);
  return {metrics,warnings:[...base.warnings],status:base.status,normative_note:NOTE};
}

module.exports={APPROVED_INTERVALS,CATEGORY,TOTAL_FOUR,NOTE,classifyFfmqInterval,scoreFfmqWithApprovedIntervals};
