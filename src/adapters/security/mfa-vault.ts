import {createCipheriv,createDecipheriv,randomBytes} from "node:crypto";
export class MfaVault{
  private readonly key:Buffer;
  constructor(key:Buffer){if(key.length!==32||key.every(x=>x===0))throw new Error("EXPLICIT_MFA_KEY_REQUIRED");this.key=Buffer.from(key);}
  seal(credential:string,secret:Buffer):string{
    const nonce=randomBytes(12),cipher=createCipheriv("aes-256-gcm",this.key,nonce);
    cipher.setAAD(Buffer.from("pedpsy-mfa-v1:"+credential));
    const encrypted=Buffer.concat([cipher.update(secret),cipher.final()]);
    return "v1."+[nonce,encrypted,cipher.getAuthTag()].map(x=>x.toString("base64url")).join(".");
  }
  open(credential:string,sealed:string):Buffer{
    if(!/^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{27}\.[A-Za-z0-9_-]{22}$/.test(sealed))throw new Error("INVALID_MFA_ENVELOPE");
    const parts=sealed.split(".");
    if(parts.slice(1).some(x=>Buffer.from(x,"base64url").toString("base64url")!==x))throw new Error("INVALID_MFA_ENVELOPE");
    const decipher=createDecipheriv("aes-256-gcm",this.key,Buffer.from(parts[1]!,"base64url"));
    decipher.setAAD(Buffer.from("pedpsy-mfa-v1:"+credential));decipher.setAuthTag(Buffer.from(parts[3]!,"base64url"));
    const secret=Buffer.concat([decipher.update(Buffer.from(parts[2]!,"base64url")),decipher.final()]);
    if(secret.length!==20){secret.fill(0);throw new Error("INVALID_MFA_SECRET");}return secret;
  }
}
