import {timingSafeEqual} from "node:crypto";
// Missing/invalid opt-in disables ONLY registration. Never generate or rewrite
// a key automatically; old administrative configuration keeps working.
export function contactDemoKey(env:NodeJS.ProcessEnv):Buffer|null{
  if(env.PEDPSY_CONTACT_DEMO!=="1")return null;
  const decode=(value:string|undefined):Buffer|null=>{
    if(!value)return null;const bytes=Buffer.from(value,"base64");
    if(bytes.length!==32||bytes.toString("base64")!==value||bytes.every(x=>x===0)){bytes.fill(0);return null;}return bytes;
  };
  const contact=decode(env.PEDPSY_CONTACT_KEY),mfa=decode(env.PEDPSY_MFA_KEY);
  try{if(!contact||!mfa||timingSafeEqual(contact,mfa)){contact?.fill(0);return null;}return contact;}finally{mfa?.fill(0);}
}
