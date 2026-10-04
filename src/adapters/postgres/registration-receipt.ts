import type {Pool} from "pg";
import type {RegistrationReceipt,RegistrationPublicContext,SyntheticRegistrationReceipt} from "../../ports/registration-receipt.js";
import {ParticipationError} from "../../ports/errors.js";
import {validToken,equalText} from "../../../storage/access.js";
import {ContactTokenVault} from "../security/contact-token-vault.js";
import {accountTransaction,tokenHash} from "./account-transaction.js";
interface Material {status:"material"|"not_available"|"requirements_changed"|"throttled";delivery_id?:string;token_envelope?:string;confirmation_hash?:string;expires_at?:number}
function checkStatus(status:string):void{
  if(status==="throttled")throw new ParticipationError(429,"REGISTRATION_THROTTLED");
  if(status==="requirements_changed")throw new ParticipationError(409,"PARTICIPATION_REQUIREMENTS_CHANGED");
  if(!["material","delivered"].includes(status))throw new ParticipationError(404,"NOT_AVAILABLE");
}
export class PostgresRegistrationReceipt implements RegistrationReceipt {
  constructor(private readonly pool:Pool,private readonly vault:ContactTokenVault,syntheticEnabled:true){
    if(syntheticEnabled!==true)throw new Error("EXPLICIT_SYNTHETIC_RECEIPT_REQUIRED");
  }
  async context(inviteToken:string):Promise<RegistrationPublicContext>{
    if(!validToken(inviteToken))throw new ParticipationError(404,"NOT_AVAILABLE");
    return accountTransaction(this.pool,async c=>(await c.query<{data:RegistrationPublicContext}>("SELECT pedpsy.registration_context($1) data",[tokenHash(inviteToken)])).rows[0]!.data);
  }
  async receipt(inviteToken:string,browserToken:string):Promise<SyntheticRegistrationReceipt>{
    if(!validToken(inviteToken)||!validToken(browserToken)||inviteToken===browserToken)throw new ParticipationError(404,"NOT_AVAILABLE");
    const material=await accountTransaction(this.pool,async c=>(await c.query<{data:Material}>("SELECT pedpsy.registration_receipt_material($1,$2) data",[tokenHash(inviteToken),tokenHash(browserToken)])).rows[0]!.data);
    // Throttle/denial metadata commits before an error is returned.
    checkStatus(material.status);
    let confirmation:string;
    try{
      confirmation=this.vault.open(material.delivery_id!,material.token_envelope!);
      if(!equalText(tokenHash(confirmation),material.confirmation_hash!))throw new Error("CONTACT_DIGEST_MISMATCH");
    }catch{throw new ParticipationError(500,"CONTACT_RECEIPT_UNAVAILABLE");}
    // Crypto is outside SQL locks. A fresh guarded acknowledgement is required
    // before returning any plaintext, even if an earlier read was permitted.
    const status=await accountTransaction(this.pool,async c=>(await c.query<{status:string}>("SELECT pedpsy.finish_registration_receipt($1,$2,$3,$4) status",
      [tokenHash(inviteToken),tokenHash(browserToken),material.delivery_id,tokenHash(confirmation)])).rows[0]!.status);
    checkStatus(status);
    return {synthetic:true,confirmation_token:confirmation,expires_at:material.expires_at!};
  }
}
