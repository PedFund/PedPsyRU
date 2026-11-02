"use strict";
const {spawn}=require("node:child_process");
// Existing bounded, redacted test-only pg_dump/restore transport, shared by
// diagnostic and operational recovery proofs. Never invoke a local owner DB.
function dockerTool(args,input){
  const container=process.env.PGTEST_CONTAINER;
  if(process.env.PEDPSY_PG_TEST!=="1"||container&&!/^[a-f0-9]{64}$/.test(container))throw new Error("EXPLICIT_SYNTHETIC_CONTAINER_REQUIRED");
  const tool=container?{command:"docker",args:["exec",...(input?["-i"]:[]),container,...args]}:require("./pg-native-fixture.js").nativeTestTool(args);
  return new Promise((resolve,reject)=>{
    const p=spawn(tool.command,tool.args,{stdio:["pipe","pipe","pipe"],shell:false,windowsHide:true});
    const output=[];let size=0;
    const timer=setTimeout(()=>{p.kill();reject(new Error("PG_TOOL_TIMEOUT"));},30000);
    p.stdout.on("data",b=>{size+=b.length;if(size>4*1024*1024){p.kill();reject(new Error("SYNTHETIC_ARCHIVE_TOO_LARGE"));}else output.push(b);});
    p.stderr.resume();p.stdin.on("error",()=>{});
    p.on("error",e=>{clearTimeout(timer);reject(e);});
    p.on("close",code=>{clearTimeout(timer);if(code!==0)reject(new Error("PG_TOOL_FAILED"));else resolve(Buffer.concat(output));});
    p.stdin.end(input);
  });
}
module.exports={dockerTool};
