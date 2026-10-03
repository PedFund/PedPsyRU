"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict");
const {createQueue}=require("../web/draft-model.js");
const initial={status:"draft",revision:1,current_item_id:"q03",responses:[{item_id:"q01",value:"A"}]};
const edit=(value="B",item="q04")=>({current_item_id:item,responses:[{item_id:"q01",value}]});
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test("draft queue initializes clean, copies data, and restores the server revision/slide",()=>{
  const q=createQueue({save:()=>{throw new Error("unexpected");}});q.load(initial);
  assert.equal(q.state().dirty,false);assert.equal(q.state().status,"saved");assert.equal(q.state().snapshot.current_item_id,"q03");
  q.state().snapshot.responses[0].value="B";assert.equal(q.state().snapshot.responses[0].value,"A");
});
test("rapid edits are coalesced before dispatch and sent with the confirmed revision",async()=>{
  const sent=[],q=createQueue({save:async input=>{sent.push(input);return {revision:input.expected_revision+1};}});q.load(initial);
  q.edit(edit("A","q04"));q.edit(edit("B","q08"));assert.equal(q.state().dirty,true);
  const state=await q.flush();assert.equal(sent.length,1);assert.equal(sent[0].expected_revision,1);assert.equal(sent[0].current_item_id,"q08");
  assert.equal(state.revision,2);assert.equal(state.dirty,false);assert.equal(state.status,"saved");
});
test("an older acknowledgement does not mark newer edits saved; saves remain serial",async()=>{
  const sent=[],waiters=[],events=[];let active=0,max=0;
  const q=createQueue({onChange:s=>events.push(s),save:input=>{sent.push(input);active++;max=Math.max(max,active);
    return new Promise(resolve=>waiters.push(()=>{active--;resolve({revision:input.expected_revision+1});}));}});q.load(initial);
  q.edit(edit("A","q04"));await tick();q.edit(edit("B","q08"));waiters.shift()();await tick();
  assert.equal(q.state().dirty,true);assert.equal(q.state().status,"saving");assert.equal(sent[1].expected_revision,2);
  assert.equal(sent[1].current_item_id,"q08");waiters.shift()();const state=await q.flush();assert.equal(state.revision,3);assert.equal(max,1);assert.equal(state.dirty,false);
  assert.ok(events.some(s=>s.revision===2 && s.dirty));
});
test("revision conflict stops writes, retains local snapshot and requires explicit server reload",async()=>{
  let calls=0;const q=createQueue({save:async()=>{calls++;throw Object.assign(new Error(),{status:409,code:"REVISION_CONFLICT"});}});q.load(initial);q.edit(edit());
  const state=await q.flush();assert.equal(state.status,"conflict");assert.equal(state.snapshot.responses[0].value,"B");assert.equal(state.dirty,true);
  assert.throws(()=>q.edit(edit()),/BLOCKED/);await q.flush();assert.equal(calls,1);
  q.load({...initial,revision:3,current_item_id:"q10"});assert.equal(q.state().snapshot.current_item_id,"q10");assert.equal(q.state().dirty,false);
});
test("lost response, authentication loss and completed attempts never auto-retry",async()=>{
  for(const [error,status] of [[new Error("network"),"failed"],[{status:401},"auth"],[{status:409,code:"ATTEMPT_COMPLETED"},"completed"]]){
    let calls=0;const q=createQueue({save:async()=>{calls++;throw error;}});q.load(initial);q.edit(edit());await q.flush();await q.flush();assert.equal(q.state().status,status);assert.equal(calls,1);
  }
});
test("invalid acknowledgement never reports saved and loading while a save runs is blocked",async()=>{
  let release;const q=createQueue({save:()=>new Promise(resolve=>{release=resolve;})});q.load(initial);q.edit(edit());await tick();
  assert.throws(()=>q.load(initial),/IN_PROGRESS/);release({revision:1});await q.flush();assert.equal(q.state().status,"failed");assert.equal(q.state().dirty,true);
});
test("completed server state is read-only and confirmed clearing sends a canonical empty snapshot",async()=>{
  const sent=[],q=createQueue({save:async input=>{sent.push(input);return {revision:input.expected_revision+1};}});
  q.load({...initial,status:"completed"});assert.equal(q.state().status,"readonly");assert.throws(()=>q.edit(edit()),/BLOCKED/);
  q.load(initial);q.edit({current_item_id:"q01",responses:[]});await q.flush();assert.deepEqual(sent[0],{expected_revision:1,current_item_id:"q01",responses:[]});
});
