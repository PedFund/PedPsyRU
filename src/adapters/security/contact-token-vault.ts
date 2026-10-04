import {createCipheriv,createDecipheriv,randomBytes} from "node:crypto";
// Purpose/row-bound durable confirmation payload. Separate from the MFA key
// and envelope; no plaintext token in DB, audit, HTTP start or logging.
export class ContactTokenVault{
  private readonly key:Buffer;
  constructor(key:Buffer){if(key.length!==32||key.every(x=>x===0))throw new Error("EXPLICIT_CONTACT_KEY_REQUIRED");this.key=Buffer.from(key);}
  seal(deliveryId:string,token:string):string{
    if(!/^[A-Za-z0-9_-]{43}$/.test(token))throw new Error("INVALID_CONFIRMATION_TOKEN");
    const nonce=randomBytes(12),cipher=createCipheriv("aes-256-gcm",this.key,nonce);
    cipher.setAAD(Buffer.from("pedpsy-email-confirmation-v1:"+deliveryId));
    const encrypted=Buffer.concat([cipher.update(token,"ascii"),cipher.final()]);
    return "v1."+[nonce,encrypted,cipher.getAuthTag()].map(x=>x.toString("base64url")).join(".");
  }
  open(deliveryId:string,envelope:string):string{
    if(!/^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{58}\.[A-Za-z0-9_-]{22}$/.test(envelope))throw new Error("INVALID_CONTACT_ENVELOPE");
    const p=envelope.split(".");if(p.slice(1).some(x=>Buffer.from(x,"base64url").toString("base64url")!==x))throw new Error("INVALID_CONTACT_ENVELOPE");
    const decipher=createDecipheriv("aes-256-gcm",this.key,Buffer.from(p[1]!,"base64url"));
    decipher.setAAD(Buffer.from("pedpsy-email-confirmation-v1:"+deliveryId));decipher.setAuthTag(Buffer.from(p[3]!,"base64url"));
    const clear=Buffer.concat([decipher.update(Buffer.from(p[2]!,"base64url")),decipher.final()]);
    try{const token=clear.toString("ascii");if(!/^[A-Za-z0-9_-]{43}$/.test(token))throw new Error("INVALID_CONFIRMATION_TOKEN");return token;}finally{clear.fill(0);}
  }
}
