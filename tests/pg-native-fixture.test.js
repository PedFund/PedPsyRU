"use strict";
const {test}=require('node:test'),assert=require('node:assert/strict'),{nativeTestTool}=require('./pg-native-fixture.js');
test('Native PostgreSQL test transport cannot target owner databases, remote hosts or arbitrary commands/arguments',()=>{
 const env={PEDPSY_PG_TEST:'1',PGTEST_HOST:'127.0.0.1',PGTEST_PORT:'55432'},args=['pg_dump','-U','postgres','-Fc','-d','pedpsy_ci_0123456789abcdef'];
 for(const changed of [{...env,PEDPSY_PG_TEST:'0'},{...env,PGTEST_HOST:'example.test'},{...env,PGTEST_PORT:'1'}])assert.throws(()=>nativeTestTool(args,changed));
 for(const bad of [['psql',...args.slice(1)],['pg_dump','-U','postgres','-d','pedpsy_owner'],['pg_restore','-U','postgres','--dbname=postgres'],[...args,'--host=example.test'],[...args,'--file=C:/private'],[...args,'--clean'],[...args,'-d','pedpsy_ci_abcdef0123456789']])assert.throws(()=>nativeTestTool(bad,env));
});
