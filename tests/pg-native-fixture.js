"use strict";
const path=require('node:path'),fs=require('node:fs');
// Same real pg_dump/pg_restore assertions on the explicitly selected local test
// server. Never accepts a user database, network host, output path or shell flag.
function nativeTestTool(args,env=process.env){
 if(env.PEDPSY_PG_TEST!=='1'||!['127.0.0.1','localhost'].includes(env.PGTEST_HOST)||!/^\d+$/.test(env.PGTEST_PORT||'')||Number(env.PGTEST_PORT)<1024||Number(env.PGTEST_PORT)>65535||!Array.isArray(args)||!['pg_dump','pg_restore'].includes(args[0]))throw Error('EXPLICIT_LOCAL_TEST_TOOLS_REQUIRED');
 let databases=0,user=false;const database=value=>{if(!/^pedpsy_ci_[a-f0-9]{16}$/.test(value))throw Error('SYNTHETIC_DATABASE_REQUIRED');databases++;};
 for(let i=1;i<args.length;i++){
  const a=args[i];if(a==='-U'){if(user||args[++i]!=='postgres')throw Error('SYNTHETIC_USER_REQUIRED');user=true;}
  else if(a==='-d')database(args[++i]);else if(a.startsWith('--dbname='))database(a.slice(9));
  else if(/^pedpsy_ci_/.test(a))database(a);
  else if(!['-Fc','--format=custom','--no-owner','--no-acl','--no-privileges','--single-transaction','--exit-on-error'].includes(a))throw Error('UNSUPPORTED_TEST_TOOL_ARGUMENT');
 }
 if(databases!==1||!user)throw Error('SYNTHETIC_DATABASE_REQUIRED');
 const executable=path.join(__dirname,'../.local/pg18-portable/pgsql/bin',args[0]+'.exe');
 if(!fs.existsSync(executable))throw Error('LOCAL_POSTGRES_TEST_TOOLS_UNAVAILABLE');
 return {command:executable,args:['-h',env.PGTEST_HOST,'-p',env.PGTEST_PORT,...args.slice(1)]};
}
module.exports={nativeTestTool};
