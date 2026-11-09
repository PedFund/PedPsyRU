"use strict";
// Owner-only first superadministrator bootstrap for staging/production.
// The SQL function is one-use and refuses any database outside the approved names.
const {randomBytes}=require("node:crypto");
const {readFileSync}=require("node:fs");
const {Pool}=require("pg");
const {bootstrapFirst}=require("./local-demo.js");
function required(name){const v=process.env[name];if(typeof v!=="string"||!v.length)throw new Error("ENV_REQUIRED");return v;}
function integer(name,fallback){const n=Number(process.env[name]??fallback);if(!Number.isInteger(n)||n<1||n>65535)throw new Error("ENV_INVALID");return n;}
(async()=>{
  if(!process.stdout.isTTY)throw new Error("INTERACTIVE_TTY_REQUIRED");
  const database=required("PGDATABASE"),login=process.env.PEDPSY_FIRST_LOGIN??"PEDPSY-ADMIN";
  if(process.env.PEDPSY_FIRST_CONFIRM!==database)throw new Error("FIRST_CONFIRM_REQUIRED");
  if(!/^pedpsy_(demo|ci|staging|prod)_[a-f0-9]{16}$/.test(database))throw new Error("DATABASE_INVALID");
  if(!/^[A-Z0-9-]{3,80}$/.test(login))throw new Error("LOGIN_INVALID");
  const sslMode=required("PGSSL");if(sslMode!=="require"&&sslMode!=="verify-full")throw new Error("SSL_REQUIRED");
  const pool=new Pool({host:required("PGHOST"),port:integer("PGPORT","5432"),database,user:required("PGUSER"),password:required("PGPASSWORD"),
    ssl:{rejectUnauthorized:sslMode==="verify-full",...(process.env.PEDPSY_PG_CA_CERT?{ca:readFileSync(process.env.PEDPSY_PG_CA_CERT,"utf8")}:{})},
    max:2,connectionTimeoutMillis:10000,idleTimeoutMillis:5000});
  const client=await pool.connect();
  try{
    const password=randomBytes(24).toString("base64url");
    await bootstrapFirst(client,login,password);
    console.log("First superadministrator created; no session was created.");
    console.log("Login: "+login);
    console.log("One-time password: "+password);
    console.log("Complete MFA immediately; keep recovery codes offline.");
  }finally{client.release();await pool.end();}
})().catch(()=>{console.error("First superadmin bootstrap failed; database state is not confirmed.");process.exitCode=1;});
