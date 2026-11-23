"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const {scoreNumericPassport}=require("../core/numeric-passport.js");
const originalKey=require("../methods/approved/v1/keys/ffmq_39.key.json");
const {APPROVED_INTERVALS,CATEGORY,TOTAL_FOUR,NOTE,classifyFfmqInterval,scoreFfmqWithApprovedIntervals}=require("../core/ffmq-norms.js");

test("FFMQ-39: P25 and P75 of all seven measures belong to the normative interval",()=>{
  assert.deepEqual(Object.keys(APPROVED_INTERVALS).sort(),["aware_action","describe","nonjudging","nonreactivity","observe","total_4","total_5"]);
  for(const [code,{p25,p75}] of Object.entries(APPROVED_INTERVALS)){
    assert.equal(classifyFfmqInterval(code,p25),CATEGORY.within,code+" P25");
    assert.equal(classifyFfmqInterval(code,p75),CATEGORY.within,code+" P75");
    assert.equal(classifyFfmqInterval(code,p25-1),CATEGORY.below,code+" below P25");
    assert.equal(classifyFfmqInterval(code,p75+1),CATEGORY.above,code+" above P75");
  }
  assert.equal(APPROVED_INTERVALS.total_5.p25,121.5);
  assert.equal(APPROVED_INTERVALS.total_5.p75,144);
  assert.equal(APPROVED_INTERVALS.total_4.p25,96);
  assert.equal(APPROVED_INTERVALS.total_4.p75,118);
  assert.equal(classifyFfmqInterval("total_5",121),CATEGORY.below);
  assert.equal(classifyFfmqInterval("total_5",122),CATEGORY.within);
  assert.throws(()=>classifyFfmqInterval("unknown",30),/FFMQ_NORM_INPUT_INVALID/);
  assert.throws(()=>classifyFfmqInterval("observe",NaN),/FFMQ_NORM_INPUT_INVALID/);
});

test("FFMQ-39: new four-scale sum does not replace the original five-scale total",()=>{
  const responses=Array(39).fill(3);
  const old=scoreNumericPassport(originalKey,responses).metrics;
  const next=scoreFfmqWithApprovedIntervals(responses);
  assert.deepEqual(TOTAL_FOUR,["describe","aware_action","nonjudging","nonreactivity"]);
  for(const [code,value] of Object.entries(old))assert.equal(next.metrics[code],value,"historical scoring differs: "+code);
  assert.equal(next.metrics.observe,24);
  assert.equal(next.metrics.total_4,93);
  assert.equal(next.metrics.total_5,117);
  assert.equal(next.metrics.total_5,next.metrics.observe+next.metrics.total_4);
  for(const code of Object.keys(APPROVED_INTERVALS)){
    assert.equal(next.metrics[code+" – нормативный интервал"],classifyFfmqInterval(code,next.metrics[code]));
  }
  assert.match(next.normative_note,/Предварительные нормативные интервалы/);
  assert.match(NOTE,/не клинические и не диагностические пороги/);
});

test("FFMQ-39: items 4 and 28 retain their approved direct/reverse keys",()=>{
  const base=Array(39).fill(3);
  const original=scoreNumericPassport(originalKey,base).metrics;
  const item4=base.slice();item4[3]=5;
  const a=scoreFfmqWithApprovedIntervals(item4).metrics;
  assert.equal(a.nonreactivity,original.nonreactivity+2);
  assert.equal(a.total_4,93+2);
  const item28=base.slice();item28[27]=5;
  const b=scoreFfmqWithApprovedIntervals(item28).metrics;
  assert.equal(b.aware_action,original.aware_action-2);
  assert.equal(b.total_4,93-2);
});

test("FFMQ-39: historical key remains untouched and invalid answers are rejected",()=>{
  const snapshot=JSON.stringify(originalKey);
  scoreFfmqWithApprovedIntervals(Array(39).fill(1));
  scoreFfmqWithApprovedIntervals(Array(39).fill(5));
  assert.equal(JSON.stringify(originalKey),snapshot);
  assert.deepEqual(Object.keys(originalKey.derived),["total_5"]);
  assert.throws(()=>scoreFfmqWithApprovedIntervals(Array(38).fill(3)),/Invalid complete numeric questionnaire/);
  assert.throws(()=>scoreFfmqWithApprovedIntervals(Array(39).fill(0)),/Invalid complete numeric questionnaire/);
});
