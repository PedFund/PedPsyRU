"use strict";
// CI-only browser against disposable synthetic PG, NOT desktop automation.
// Uses preinstalled official runner Chrome; no packages/downloads/profile reuse.
const {spawn}=require("node:child_process"),fs=require("node:fs/promises"),path=require("node:path"),os=require("node:os");
async function reloadDocument({evaluate,navigate,wait},epoch,ready){
  await evaluate(`document.documentElement.dataset.pedpsyCiReload=${JSON.stringify(epoch)}`);
  await navigate();
  await wait(`document.documentElement.dataset.pedpsyCiReload!==${JSON.stringify(epoch)} && (${ready})`);
}
async function chromeFixture(url){
  if(process.platform!=="linux"||process.env.PEDPSY_PG_TEST!=="1"||process.env.PGTEST_BROWSER!=="google-chrome"||new URL(url).origin!=="http://127.0.0.1:4174")throw new Error("EXPLICIT_SYNTHETIC_CI_BROWSER_REQUIRED");
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),"pedpsy-browser-")),downloads=path.join(directory,"downloads");await fs.mkdir(downloads);
  // Sandbox exemption is confined to ephemeral headless CI; never server flags.
  const child=spawn("google-chrome",["--headless","--remote-debugging-pipe","--disable-gpu","--no-sandbox","--no-first-run","--disable-background-networking","--disable-sync","--disable-component-update","--user-data-dir="+path.join(directory,"profile"),"about:blank"],{stdio:["ignore","ignore","ignore","pipe","pipe"],shell:false});
  const pending=new Map(),dialogs=new Map();let seq=0,reloadEpoch=0,buffer=Buffer.alloc(0),closed=false,stage="browser startup";
  const fail=()=>{for(const p of [...pending.values(),...dialogs.values()]){clearTimeout(p.timer);p.reject(new Error("CI_BROWSER_UNAVAILABLE"));}pending.clear();dialogs.clear();};child.once("error",fail);child.once("exit",fail);child.stdio[3].on("error",fail);
  child.stdio[4].on("data",chunk=>{buffer=Buffer.concat([buffer,chunk]);let i;
    while((i=buffer.indexOf(0))>=0){const data=buffer.subarray(0,i);buffer=buffer.subarray(i+1);let message;try{message=JSON.parse(data.toString("utf8"));}catch{fail();continue;}
      if(message.method==="Page.javascriptDialogOpening"&&dialogs.has(message.sessionId)){const p=dialogs.get(message.sessionId);dialogs.delete(message.sessionId);clearTimeout(p.timer);send("Page.handleJavaScriptDialog",{accept:true},message.sessionId).then(p.resolve,p.reject);}
      if(message.id&&pending.has(message.id)){const p=pending.get(message.id);pending.delete(message.id);clearTimeout(p.timer);message.error?p.reject(new Error("CI_BROWSER_COMMAND_FAILED")):p.resolve(message.result);}}
  });
  function send(method,params={},sessionId,timeoutMs=10000){return new Promise((resolve,reject)=>{const id=++seq,where=stage,timer=setTimeout(()=>{pending.delete(id);reject(new Error("CI_BROWSER_COMMAND_TIMEOUT: "+method+" / "+where));},timeoutMs);pending.set(id,{resolve,reject,timer});child.stdio[3].write(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})})+"\0");});}
  const close=async()=>{if(closed)return;closed=true;await send("Browser.close").catch(()=>{});if(child.exitCode===null&&child.signalCode===null)await new Promise(resolve=>{const timer=setTimeout(()=>{child.kill("SIGTERM");resolve();},3000);child.once("exit",()=>{clearTimeout(timer);resolve();});});fail();
    const target=path.resolve(directory),root=path.resolve(os.tmpdir());if(path.dirname(target)!==root||!path.basename(target).startsWith("pedpsy-browser-"))throw new Error("UNSAFE_BROWSER_CLEANUP_TARGET");await fs.rm(target,{recursive:true,force:true});};
  try{
    // Establish browser-process readiness separately from target/page assertions.
    // Cold runner startup has a bounded 30s budget; page commands remain 10s.
    await send("Browser.getVersion",{},undefined,30000);stage="browser target startup";
    await send("Browser.setDownloadBehavior",{behavior:"allow",downloadPath:downloads});
    const tab=async targetUrl=>{
    if(new URL(targetUrl).origin!=="http://127.0.0.1:4174")throw new Error("EXPLICIT_SYNTHETIC_CI_BROWSER_REQUIRED");
    const target=await send("Target.createTarget",{url:targetUrl}),{sessionId}=await send("Target.attachToTarget",{targetId:target.targetId,flatten:true});await send("Runtime.enable",{},sessionId);await send("Page.enable",{},sessionId);
    const evaluate=async(expression)=>{const r=await send("Runtime.evaluate",{expression,returnByValue:true,awaitPromise:true},sessionId);if(r.exceptionDetails)throw new Error("CI_BROWSER_PAGE_EVALUATION_FAILED");return r.result.value;};
    const wait=async(expression)=>{const end=Date.now()+10000,where=stage;while(Date.now()<end){try{if(await evaluate(`(()=>{try{return Boolean(${expression})}catch{return false}})()`))return;}catch(e){if(!["CI_BROWSER_PAGE_EVALUATION_FAILED","CI_BROWSER_COMMAND_FAILED"].includes(e.message))throw e;}await new Promise(resolve=>setTimeout(resolve,25));}throw new Error("CI_BROWSER_STATE_TIMEOUT / "+where);};
    const reload=async ready=>{
      // A visibility predicate can still be true in the OLD document after the
      // reload command returns. Require a fresh DOM epoch as well as readiness.
      // CDP navigation avoids evaluating location.reload in a dying JS context.
      const epoch=String(++reloadEpoch);
      await reloadDocument({evaluate,navigate:()=>send("Page.reload",{},sessionId),wait},epoch,ready);
    };
    const confirmNext=()=>new Promise((resolve,reject)=>{if(dialogs.has(sessionId)){reject(new Error("CI_DIALOG_ALREADY_PENDING"));return;}const timer=setTimeout(()=>{dialogs.delete(sessionId);reject(new Error("CI_DIALOG_TIMEOUT"));},5000);dialogs.set(sessionId,{resolve,reject,timer});});
    return {send:(method,params)=>send(method,params,sessionId),evaluate,wait,reload,confirmNext};
    };
    return {...await tab(url),tab,downloads,close,setStage:value=>{if(!/^[a-z ]{1,50}$/.test(value))throw new Error("INVALID_CI_STAGE_LABEL");stage=value;}};
  }catch(e){await close();throw e;}
}
module.exports={chromeFixture,reloadDocument};
