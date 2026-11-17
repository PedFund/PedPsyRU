"use strict";
// Production/clean-DB migration runner. Run only against an explicitly confirmed
// database after a verified backup; it never seeds demo data or imports local data.
const fs=require("node:fs");
const path=require("node:path");
const {Pool}=require("pg");
const {migratePostgres,grantRuntime}=require("../dist/src/adapters/postgres/migrate.js");
function required(name){const v=process.env[name];if(typeof v!=="string"||!v.length)throw new Error("ENV_REQUIRED");return v;}
function integer(name,fallback){const n=Number(process.env[name]??fallback);if(!Number.isInteger(n)||n<1||n>65535)throw new Error("ENV_INVALID");return n;}
(async()=>{
  const database=required("PGDATABASE"),runtimeRole=required("PEDPSY_RUNTIME_ROLE");
  if(process.env.PEDPSY_MIGRATION_CONFIRM!==database)throw new Error("MIGRATION_CONFIRM_REQUIRED");
  if(!/^[a-z0-9_]{1,63}$/.test(database)||database.startsWith("pedpsy_demo_"))throw new Error("DATABASE_INVALID");
  if(!/^pedpsy_runtime_[a-f0-9]{16}$/.test(runtimeRole))throw new Error("RUNTIME_ROLE_INVALID");
  const sslMode=required("PGSSL");if(sslMode!=="require"&&sslMode!=="verify-full")throw new Error("SSL_REQUIRED");
  const pool=new Pool({host:required("PGHOST"),port:integer("PGPORT","5432"),database,user:required("PGUSER"),password:required("PGPASSWORD"),
    ssl:{rejectUnauthorized:sslMode==="verify-full",...(process.env.PEDPSY_PG_CA_CERT?{ca:fs.readFileSync(process.env.PEDPSY_PG_CA_CERT,"utf8")}:{})},max:2,connectionTimeoutMillis:10000,idleTimeoutMillis:5000});
  const client=await pool.connect();
  try{
    const applied=await migratePostgres(client,path.join(__dirname,"../storage/postgres"));
    // Migrations commit on their own; a later grant failure must not be reported
    // as an unconfirmed database state.
    console.log("MIGRATIONS_APPLIED="+applied);
    await grantRuntime(client,runtimeRole);
    console.log("RUNTIME_GRANTS_APPLIED=1");
  }finally{client.release();await pool.end();}
})().catch(error=>{console.error("Production migration failed: "+(error&&error.message?error.message:"unknown")+"; the schema may already be migrated and the runtime grants are not confirmed.");process.exitCode=1;});
