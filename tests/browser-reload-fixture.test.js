"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict"),{runInNewContext}=require("node:vm"),{reloadDocument}=require("./browser-fixture.js");
test("browser reload barrier rejects old-ready DOM and new-unready DOM, accepts only new-ready document",async()=>{
  const state={document:{documentElement:{dataset:{}}},ready:true},calls=[];
  await reloadDocument({evaluate:async expression=>{calls.push("mark old document");runInNewContext(expression,state);},navigate:async()=>{calls.push("one CDP navigation");},wait:async expression=>{
    calls.push("fresh document readiness");assert.equal(runInNewContext(expression,state),false,"old ready document must not satisfy reload");
    state.document={documentElement:{dataset:{}}};state.ready=false;assert.equal(runInNewContext(expression,state),false,"new DOM must still await app readiness");
    state.ready=true;assert.equal(runInNewContext(expression,state),true);
  }},"epoch-1","ready");assert.deepEqual(calls,["mark old document","one CDP navigation","fresh document readiness"]);
});
test("browser reload barrier propagates navigation/readiness failure without navigation retries or assertion suppression",async()=>{
  for(const failing of ["navigate","wait"]){let marks=0,navigations=0,waits=0;const error=new Error("synthetic "+failing);
    await assert.rejects(reloadDocument({evaluate:async()=>{marks++;},navigate:async()=>{navigations++;if(failing==="navigate")throw error;},wait:async()=>{waits++;throw error;}},"epoch-2","ready"),e=>e===error);
    assert.equal(marks,1);assert.equal(navigations,1);assert.equal(waits,failing==="navigate"?0:1);
  }
});
