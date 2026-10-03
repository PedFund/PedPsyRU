import {createHmac,timingSafeEqual} from "node:crypto";
// RFC4226 dynamic truncation; RFC6238 30-second time steps. No custom cipher.
export function otpAt(secret:Buffer,counter:number,digits=6):string{
  if(!Number.isSafeInteger(counter)||counter<0||![6,8].includes(digits)||secret.length<20)throw new Error("INVALID_OTP_PARAMETERS");
  const message=Buffer.alloc(8);message.writeBigUInt64BE(BigInt(counter));
  const digest=createHmac("sha1",secret).update(message).digest(),offset=digest[digest.length-1]!&15;
  const value=digest.readUInt32BE(offset)&0x7fffffff;digest.fill(0);
  return String(value%10**digits).padStart(digits,"0");
}
export function matchingStep(secret:Buffer,code:string,at:number):number|null{
  if(!/^[0-9]{6}$/.test(code)||!Number.isSafeInteger(at)||at<0)return null;
  const step=Math.floor(at/30000);let matched:number|null=null;
  for(const candidate of [step-1,step,step+1]){
    if(candidate<0)continue;
    if(timingSafeEqual(Buffer.from(code),Buffer.from(otpAt(secret,candidate))))matched=candidate;
  }return matched;
}
export function base32(secret:Buffer):string{
  const alphabet="ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";let out="",value=0,bits=0;
  for(const byte of secret){value=(value<<8)|byte;bits+=8;while(bits>=5){bits-=5;out+=alphabet[(value>>>bits)&31];}}
  if(bits)out+=alphabet[(value<<(5-bits))&31];return out;
}
