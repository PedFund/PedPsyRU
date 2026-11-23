"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const {grantRuntime}=require("../dist/src/adapters/postgres/migrate.js");
const role="pedpsy_runtime_0123456789abcdef";

// Minimal stand-in for a PoolClient: the runner only needs query() plus
// rowCount/rows, and the grant list itself is asserted through the calls.
function fakeClient({foreignOwners=[],unsafeRole=false}={}){
  const calls=[];
  const client={calls,query:async sql=>{
    calls.push(String(sql));
    // The checks nest SELECTs from pg_roles, so the most specific statement wins.
    if(/FROM pg_auth_members/.test(sql))return {rowCount:0,rows:[]};
    if(/FROM pg_class WHERE relowner/.test(sql))return {rowCount:0,rows:[]};
    if(/FROM pg_roles WHERE rolname/.test(sql))return {rowCount:1,rows:[{rolsuper:unsafeRole,rolbypassrls:false,rolcreaterole:false,rolcreatedb:false}]};
    if(/pg_get_userbyid\(p\.proowner\)/.test(sql))return {rowCount:foreignOwners.length,rows:foreignOwners.map(owner=>({owner,functions:"2"}))};
    return {rowCount:0,rows:[]};
  }};
  return client;
}
test("runtime grants reject an invalid or privileged runtime role before any SQL",async()=>{
  await assert.rejects(grantRuntime(fakeClient(),"pedpsy_runtime_short"),/INVALID_RUNTIME_ROLE/);
  const unsafe=fakeClient({unsafeRole:true});
  await assert.rejects(grantRuntime(unsafe,role),/UNSAFE_RUNTIME_ROLE/);
  assert.equal(unsafe.calls.some(sql=>/^(GRANT|REVOKE)/.test(sql)),false,"a rejected role receives no privileges");
});
test("runtime grants fail fast when the grant role does not own every schema function",async()=>{
  const client=fakeClient({foreignOwners:["postgres"]});
  await assert.rejects(grantRuntime(client,role),/GRANT_OWNER_MISMATCH: apply runtime grants as the role that owns the pedpsy functions; foreign owners: postgres\(2\)/);
  assert.equal(client.calls.some(sql=>/^(GRANT|REVOKE)/.test(sql)),false,"no partial grant list runs before the precondition is proven");
});
test("runtime grants apply the full expected set when the role owns the schema functions",async()=>{
  const client=fakeClient();
  await grantRuntime(client,role);
  const grants=client.calls.filter(sql=>sql.startsWith("GRANT")),revokes=client.calls.filter(sql=>sql.startsWith("REVOKE"));
  assert.ok(grants.some(sql=>sql.startsWith("GRANT USAGE ON SCHEMA pedpsy")),"schema usage");
  assert.ok(grants.some(sql=>sql.includes("pedpsy.research_progress(uuid)")),"progress projection stays callable by the runtime role");
  assert.ok(grants.some(sql=>sql.includes("pedpsy.change_research_workbench(uuid,integer,text,jsonb)")),"workbench stays callable");
  assert.ok(grants.some(sql=>sql.includes("pedpsy.configure_study_stage_named(uuid,integer,uuid,text,integer,text,boolean)")),"named stage configuration stays callable");
  assert.ok(grants.some(sql=>sql.includes("pedpsy.copy_study_stage_named(uuid,integer,uuid,uuid,text,integer,text)")),"named stage copy stays callable");
 assert.ok(grants.some(sql=>sql.includes("pedpsy.set_stage_display_name(uuid,uuid,text)")),"post-activation stage rename stays callable");
  assert.ok(revokes.some(sql=>sql.includes("pedpsy.research_progress_v1(uuid)")),"internal legacy helpers stay out of the runtime role");
  assert.ok(revokes.some(sql=>sql.includes("pedpsy.change_research_workbench_v1(uuid,integer,text,jsonb)")),"internal workbench helpers stay out of the runtime role");
  assert.ok(revokes.some(sql=>sql.includes("pedpsy.change_research_workbench_v3(uuid,integer,text,jsonb)")),"renamed internal workbench helper stays out of the runtime role");
  assert.equal(grants.some(sql=>/GRANT ALL|OWNER TO/.test(sql)),false,"never a blanket grant or ownership transfer");
});
