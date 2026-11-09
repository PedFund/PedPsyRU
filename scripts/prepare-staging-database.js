"use strict";
// Staging-only bootstrap: clean database + synthetic snapshot + two superadministrators.
// Never run against production/real-data databases.
const {randomBytes}=require("node:crypto");
const {readFileSync}=require("node:fs");
const {Pool}=require("pg");
const {prepareOwnedDatabase,bootstrapFirst,bootstrapStaff}=require("./local-demo.js");
function required(name){const v=process.env[name];if(typeof v!=="string"||!v.length)throw new Error("ENV_REQUIRED");return v;}
function integer(name,fallback){const n=Number(process.env[name]??fallback);if(!Number.isInteger(n)||n<1||n>65535)throw new Error("ENV_INVALID");return n;}
(async()=>{
  if(!process.stdout.isTTY)throw new Error("INTERACTIVE_TTY_REQUIRED");
  const database=required("PGDATABASE");
  if(process.env.PEDPSY_STAGING_CONFIRM!==database)throw new Error("STAGING_CONFIRM_REQUIRED");
  if(!/^[a-z0-9_]{1,63}$/.test(database)||database.startsWith("pedpsy_demo_"))throw new Error("DATABASE_INVALID");
  const runtimeRole=required("PEDPSY_RUNTIME_ROLE");
  if(!/^pedpsy_runtime_[a-f0-9]{16}$/.test(runtimeRole))throw new Error("RUNTIME_ROLE_INVALID");
  const sslMode=required("PGSSL");if(sslMode!=="require"&&sslMode!=="verify-full")throw new Error("SSL_REQUIRED");
  if(process.env.PEDPSY_STAGING_REAL_DATA==="1")throw new Error("REAL_DATA_FORBIDDEN");
  const pool=new Pool({host:required("PGHOST"),port:integer("PGPORT","5432"),database,user:required("PGUSER"),password:required("PGPASSWORD"),
    ssl:{rejectUnauthorized:sslMode==="verify-full",...(process.env.PEDPSY_PG_CA_CERT?{ca:readFileSync(process.env.PEDPSY_PG_CA_CERT,"utf8")}:{})},
    max:2,connectionTimeoutMillis:10000,idleTimeoutMillis:5000});
  const client=await pool.connect();
  try{
    const exists=(await client.query("SELECT to_regclass('pedpsy.studies') AS table_name")).rows[0]?.table_name;
    if(process.env.PEDPSY_STAGING_ADMIN_ONLY==="1"){
      if(!exists)throw new Error("SCHEMA_NOT_PREPARED");
    }else{
      if(exists)throw new Error("TARGET_NOT_EMPTY");
      await prepareOwnedDatabase(client,runtimeRole);
    }
    let count=(await client.query("SELECT count(*)::integer n FROM pedpsy.staff_credentials")).rows[0].n;
    if(count>2)throw new Error("STAFF_ALREADY_PROVISIONED");
    console.log("Synthetic staging database prepared; no real data was imported.");
    if(count===0){
      const first=randomBytes(24).toString("base64url");
      await bootstrapFirst(client,"PEDPSY-ADMIN",first);
      console.log("Superadmin 1: PEDPSY-ADMIN");
      console.log("One-time password: "+first);
      count=1;
    }
    if(count===1){
      const second=randomBytes(24).toString("base64url");
      await bootstrapStaff(client,"PEDPSY-OWNER",second,"superadministrator");
      console.log("Superadmin 2: PEDPSY-OWNER");
      console.log("One-time password: "+second);
    }
    console.log("Complete MFA for both accounts; keep recovery codes separately.");
  }finally{client.release();await pool.end();}
})().catch(()=>{console.error("Staging preparation failed; database state is not confirmed.");process.exitCode=1;});
