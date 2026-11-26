"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict");
const Fastify=require("fastify");
const {RequestMetrics}=require("../dist/src/http/request-metrics.js");
test("request metrics stay inside the Fastify request context and expose no payload",async()=>{
  const metrics=new RequestMetrics(),app=Fastify({logger:false});
  app.addHook("onRequest",metrics.onRequest);
  app.get("/probe",async()=>{
    metrics.poolWait(7);metrics.queryStarted();metrics.queryFinished(4,"SELECT 1");metrics.releaseCache(true);metrics.releaseCache(false);
    return {snapshot:metrics.snapshot()};
  });
  try{
    const response=await app.inject({method:"GET",url:"/probe"});
    assert.equal(response.statusCode,200);
    const snapshot=response.json().snapshot;
    assert.match(snapshot.request_id,/^[a-f0-9-]{36}$/);
    assert.equal(snapshot.pool_wait_ms,7);
    assert.equal(snapshot.db_queries,1);
    assert.equal(snapshot.release_cache_hits,1);
    assert.equal(snapshot.release_cache_misses,1);
    assert.equal(typeof snapshot.event_loop_p95_ms,"number");
    assert.equal(typeof response.headers["x-request-id"],"string");
    assert.ok(!JSON.stringify(snapshot).includes("SELECT 1"),"SQL text must not be exposed");
  }finally{metrics.close();await app.close();}
});
