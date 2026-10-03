export function demoConfig(env: NodeJS.ProcessEnv) {
  const port=Number(env.PGPORT);
  if(env.PEDPSY_PG_DEMO!=="1" || !["127.0.0.1","localhost"].includes(env.PGHOST??"") || !Number.isInteger(port) || port<1024 || port>65535 ||
    !/^pedpsy_demo_[a-f0-9]{16}$/.test(env.PGDATABASE??"") || !/^pedpsy_runtime_[a-f0-9]{16}$/.test(env.PGUSER??"") || !env.PGPASSWORD)
    throw new Error("EXPLICIT_SYNTHETIC_PG_CONFIG_REQUIRED");
  return {host:env.PGHOST!,port,database:env.PGDATABASE!,user:env.PGUSER!,password:env.PGPASSWORD,max:4,
    connectionTimeoutMillis:5000,idleTimeoutMillis:5000,ssl:false as const};
}
