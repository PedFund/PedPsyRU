import {createHmac,hkdfSync,randomBytes,timingSafeEqual} from "node:crypto";
import type {RegistrationBrowser} from "../../ports/registration-browser.js";
import {ParticipationError} from "../../ports/errors.js";
const TTL_MS=3600000;
// The existing encrypted outbox key is retained unchanged. Derive a different,
// purpose/origin-bound MAC key; never use the MFA key for this contour.
export class SignedRegistrationBrowser implements RegistrationBrowser {
  private readonly key:Buffer;
  constructor(contactKey:Buffer,origin:string,private readonly now=Date.now){
    if(contactKey.length!==32||contactKey.every(x=>x===0))throw new Error("EXPLICIT_CONTACT_KEY_REQUIRED");
    const url=new URL(origin);if(url.origin!==origin||origin.length>512||url.protocol!=="https:"&&!(url.protocol==="http:"&&["127.0.0.1","localhost"].includes(url.hostname)))throw new Error("EXPLICIT_SAFE_ORIGIN_REQUIRED");
    this.key=Buffer.from(hkdfSync("sha256",contactKey,Buffer.from("pedpsy-contact-master-v1"),Buffer.from("registration-browser-v1:"+origin),32));
  }
  private tag(payload:Buffer):Buffer{return createHmac("sha256",this.key).update("pedpsy-registration-nonce-v1:").update(payload).digest().subarray(0,16);}
  create():string{
    const seconds=Math.floor(this.now()/1000);if(!Number.isSafeInteger(seconds)||seconds<0||seconds>4294967295)throw new Error("INVALID_REGISTRATION_CLOCK");
    const payload=randomBytes(16);payload.writeUInt32BE(seconds,0);return Buffer.concat([payload,this.tag(payload)]).toString("base64url");
  }
  valid(token:string):boolean{
    if(typeof token!=="string"||!/^[A-Za-z0-9_-]{43}$/.test(token))return false;
    const bytes=Buffer.from(token,"base64url");if(bytes.length!==32||bytes.toString("base64url")!==token)return false;
    const issued=bytes.readUInt32BE(0)*1000,at=this.now();
    return Number.isSafeInteger(at)&&at>=issued&&at<issued+TTL_MS&&timingSafeEqual(bytes.subarray(16),this.tag(bytes.subarray(0,16)));
  }
  expiresAt(token:string):number{
    if(!this.valid(token))throw new ParticipationError(403,"CSRF_REJECTED");return Buffer.from(token,"base64url").readUInt32BE(0)*1000+TTL_MS;
  }
  csrf(token:string):string{
    if(!this.valid(token))throw new ParticipationError(403,"CSRF_REJECTED");return createHmac("sha256",this.key).update("pedpsy-registration-csrf-v1:").update(token).digest("base64url");
  }
  assert(token:string,csrf:string):void{
    if(!this.valid(token)||typeof csrf!=="string"||!/^[A-Za-z0-9_-]{43}$/.test(csrf)||!timingSafeEqual(Buffer.from(csrf),Buffer.from(this.csrf(token))))throw new ParticipationError(403,"CSRF_REJECTED");
  }
}
