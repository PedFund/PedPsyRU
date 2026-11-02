import type {MethodData,MethodRuntimeDescriptor,MethodRuntimeIdentity,MethodRuntimeModule,MethodRuntimeRegistry} from "../ports/method-runtime.js";

// Portable JSON only; rich assets are scoped opaque references, not binary blobs.
// Resource limits protect the host; they are not a list of permitted test types.
export function copyMethodData(value:unknown):MethodData {
  let nodes=0,characters=0;const active=new Set<object>();
  function visit(v:unknown,depth:number):MethodData {
    if(++nodes>50000||depth>32)throw new Error("METHOD_DATA_LIMIT");
    if(v===null||typeof v==="boolean")return v;
    if(typeof v==="number"){if(!Number.isFinite(v))throw new Error("METHOD_DATA_NUMBER");return Object.is(v,-0)?0:v;}
    if(typeof v==="string"){characters+=v.length;if(characters>262144)throw new Error("METHOD_DATA_LIMIT");return v;}
    if(!v||typeof v!=="object"||active.has(v))throw new Error("METHOD_DATA_JSON_REQUIRED");
    if(!Array.isArray(v)&&Object.getPrototypeOf(v)!==Object.prototype&&Object.getPrototypeOf(v)!==null)throw new Error("METHOD_DATA_JSON_REQUIRED");
    if(Object.getOwnPropertySymbols(v).length)throw new Error("METHOD_DATA_JSON_REQUIRED");
    active.add(v);
    let result:MethodData;
    if(Array.isArray(v)){
      if(v.length>50000||Object.keys(v).length!==v.length)throw new Error("METHOD_DATA_JSON_REQUIRED");
      result=Object.freeze(Array.from({length:v.length},(_,i)=>{const d=Object.getOwnPropertyDescriptor(v,String(i));if(!d||!('value' in d))throw new Error("METHOD_DATA_JSON_REQUIRED");return visit(d.value,depth+1);}));
    }else{
      const entries:Record<string,MethodData>={};
      for(const key of Object.getOwnPropertyNames(v).sort()){
        if(["__proto__","constructor","prototype"].includes(key)||key.length>256)throw new Error("METHOD_DATA_KEY");
        characters+=key.length;if(characters>262144)throw new Error("METHOD_DATA_LIMIT");
        const d=Object.getOwnPropertyDescriptor(v,key)!;if(!d.enumerable||!('value' in d))throw new Error("METHOD_DATA_JSON_REQUIRED");
        entries[key]=visit(d.value,depth+1);
      }
      result=Object.freeze(entries);
    }
    active.delete(v);return result;
  }
  return visit(value,0);
}
const token=(v:unknown):v is string=>typeof v==="string"&&/^[A-Za-z0-9][A-Za-z0-9_.:@/-]{0,159}$/.test(v);
function identityKey(v:MethodRuntimeIdentity):string {
  if(!v||!token(v.contract_version)||!token(v.method_version_id)||!token(v.handler_version)||!/^sha256:[a-f0-9]{64}$/.test(v.key_digest))throw new Error("METHOD_IDENTITY_INVALID");
  return JSON.stringify([v.contract_version,v.method_version_id,v.handler_version,v.key_digest]);
}
export function createMethodRuntimeRegistry(modules:readonly MethodRuntimeModule[]):MethodRuntimeRegistry {
  const entries=new Map<string,MethodRuntimeModule>();
  for(const module of modules){
    const key=identityKey(module.descriptor),d=copyMethodData(module.descriptor) as unknown as MethodRuntimeDescriptor;
    if(entries.has(key)||[...entries.values()].some(m=>m.descriptor.method_version_id===d.method_version_id&&m.descriptor.handler_version===d.handler_version))throw new Error("METHOD_MODULE_DUPLICATE");
    if(!d.title||!Array.isArray(d.authors)||d.authors.some(a=>typeof a!=="string")||!Array.isArray(d.outputs)||
      new Set(d.outputs.map(o=>o.id)).size!==d.outputs.length||d.outputs.some(o=>!token(o.id)||!o.label||!token(o.kind))||
      [d.presentation,d.response_schema,d.result_schema].some(s=>!s||!token(s.id)||!token(s.version))||
      [module.checkDraft,module.calculate,module.acceptsResult,module.participantResult].some(fn=>typeof fn!=="function"))throw new Error("METHOD_MODULE_INVALID");
    // Capture both descriptor and callbacks: mutation of the source registration is not an update.
    entries.set(key,Object.freeze({descriptor:d,checkDraft:module.checkDraft,calculate:module.calculate,acceptsResult:module.acceptsResult,participantResult:module.participantResult}));
  }
  const resolve=(id:MethodRuntimeIdentity):MethodRuntimeModule=>{const m=entries.get(identityKey(id));if(!m)throw new Error("METHOD_MODULE_UNAVAILABLE");return m;};
  const checkedResult=(m:MethodRuntimeModule,value:unknown):MethodData=>{const result=copyMethodData(value);if(!m.acceptsResult(result))throw new Error("METHOD_RESULT_REJECTED");return result;};
  return Object.freeze({
    descriptors:()=>Object.freeze([...entries.values()].map(m=>m.descriptor)),
    describe:(id:MethodRuntimeIdentity)=>resolve(id).descriptor,
    checkDraft:(id:MethodRuntimeIdentity,data:unknown)=>{const checked=resolve(id).checkDraft(copyMethodData(data));
      if(!checked||typeof checked.valid!=="boolean"||typeof checked.complete!=="boolean"||checked.complete&&!checked.valid||!Array.isArray(checked.issues)||checked.issues.some(x=>typeof x!=="string"))throw new Error("METHOD_CHECK_REJECTED");
      return Object.freeze({valid:checked.valid,complete:checked.complete,issues:Object.freeze([...checked.issues])});},
    calculate:(id:MethodRuntimeIdentity,data:unknown)=>{const m=resolve(id),input=copyMethodData(data),check=m.checkDraft(input);
      if(check?.valid!==true||check.complete!==true)throw new Error("METHOD_INPUT_INCOMPLETE_OR_INVALID");
      return checkedResult(m,m.calculate(input));},
    participantResult:(id:MethodRuntimeIdentity,result:unknown)=>{const m=resolve(id);return copyMethodData(m.participantResult(checkedResult(m,result)));}
  });
}
