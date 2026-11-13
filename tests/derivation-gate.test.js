"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict");
const {DerivationGate}=require("../dist/src/adapters/derivation-gate.js");
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test("production gate keeps single-flight and rejects a concurrent attempt immediately",async()=>{
  let release;const gate=new DerivationGate(1,0,0);
  const first=gate.run(()=>new Promise(resolve=>{release=resolve;}));
  await tick();
  await assert.rejects(gate.run(async()=>1),error=>error.code==="LOGIN_THROTTLED");
  release();await first;
});
test("pilot gate bounds concurrency and queues bounded work instead of rejecting it",async()=>{
  const gate=new DerivationGate(2,4,1000),resolvers=[];let active=0,max=0;
  const tasks=Array.from({length:4},(_,index)=>gate.run(async()=>{
    active++;max=Math.max(max,active);await new Promise(resolve=>resolvers.push(resolve));active--;return index;
  }));
  await tick();assert.equal(active,2);assert.equal(resolvers.length,2);
  resolvers.shift()();await tick();assert.equal(active,2);assert.equal(resolvers.length,2);
  resolvers.shift()();await tick();assert.equal(active,2);
  while(resolvers.length){resolvers.shift()();await tick();}
  assert.deepEqual(await Promise.all(tasks),[0,1,2,3]);
  assert.equal(max,2);
});
test("pilot gate rejects when its queue is full or the wait times out without leaking a slot",async()=>{
  const full=new DerivationGate(1,1,1000);let release;const first=full.run(()=>new Promise(resolve=>{release=resolve;}));
  await tick();const second=full.run(async()=>2);await assert.rejects(full.run(async()=>3),error=>error.code==="LOGIN_THROTTLED");
  release();assert.equal(await second,2);await first;
  const timed=new DerivationGate(1,1,30);let releaseTimed;const held=timed.run(()=>new Promise(resolve=>{releaseTimed=resolve;}));
  await tick();await assert.rejects(timed.run(async()=>4),error=>error.code==="LOGIN_THROTTLED");
  releaseTimed();await held;assert.equal(await timed.run(async()=>5),5);
});
test("registration gate keeps its own throttle code",async()=>{
  const gate=new DerivationGate(1,0,0,"REGISTRATION_THROTTLED");let release;const first=gate.run(()=>new Promise(resolve=>{release=resolve;}));
  await tick();await assert.rejects(gate.run(async()=>1),error=>error.code==="REGISTRATION_THROTTLED");
  release();await first;
});
