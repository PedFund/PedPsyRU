import {randomBytes,randomUUID} from "node:crypto";
import type {Pool} from "pg";
import type {ParticipantRegistration,RegistrationLanding,RegistrationStart} from "../../ports/participant-registration.js";
import {participantEmail} from "../../ports/contact-email.js";
import {ParticipationError} from "../../ports/errors.js";
import {derive,SCRYPT,validPassword,validToken} from "../../../storage/access.js";
import {ContactTokenVault} from "../security/contact-token-vault.js";
import {accountTransaction,tokenHash} from "./account-transaction.js";
import {DEFAULT_PARTICIPANT_ADMISSION, type ParticipantAdmissionPolicy} from "../../ports/login-policy.js";
import {DerivationGate} from "../derivation-gate.js";
// First small persistence block only; confirmation/login/HTTP/delivery follow.
export class PostgresRegistrationStart implements Pick<ParticipantRegistration,"landing"|"start">{
  private readonly gate:DerivationGate;
  constructor(private readonly pool:Pool,private readonly vault:ContactTokenVault,private readonly derivePassword=derive,private readonly allowRealEmail=false,
    private readonly admission:ParticipantAdmissionPolicy=DEFAULT_PARTICIPANT_ADMISSION){
    this.gate=new DerivationGate(admission.derivationConcurrency,admission.queueLimit,admission.queueTimeoutMs,"REGISTRATION_THROTTLED");
  }
  async landing(inviteToken:string):Promise<RegistrationLanding>{
    if(!validToken(inviteToken))throw new ParticipationError(404,"NOT_AVAILABLE");
    return accountTransaction(this.pool,async c=>(await c.query<{data:RegistrationLanding}>("SELECT pedpsy.registration_landing($1) data",[tokenHash(inviteToken)])).rows[0]!.data);
  }
  async start(inviteToken:string,input:RegistrationStart,pendingToken:string):Promise<{status:"confirmation_requested"}>{
    if(!validToken(inviteToken)||!validToken(pendingToken))throw new ParticipationError(404,"NOT_AVAILABLE");
    if(!input||Array.isArray(input)||Object.keys(input).sort().join(",")!=="accept_contact_notice,contact_notice_version,email,password"||input.accept_contact_notice!==true||
      typeof input.contact_notice_version!=="string"||!/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(input.contact_notice_version)||!validPassword(input.password)||/[\u0000-\u001f\u007f]/.test(input.password))throw new ParticipationError(400,"INVALID_REGISTRATION_INPUT");
    const email=participantEmail(input.email);
    // This approved contour contains fictitious contacts only. A future real
    // provider/legal release must explicitly replace this synthetic restriction.
    if(!email.endsWith("@example.test")&&!this.allowRealEmail)throw new ParticipationError(400,"SYNTHETIC_CONTACT_REQUIRED");
    return this.gate.run(async()=>{
      const id=await accountTransaction(this.pool,async c=>(await c.query<{id:string|null}>("SELECT pedpsy.reserve_registration_start_v2($1,$2,$3,$4,$5,$6,$7) id",
        [tokenHash(inviteToken),tokenHash(pendingToken),email,input.contact_notice_version,this.allowRealEmail,this.admission.globalLimit,this.admission.globalWindowMs])).rows[0]!.id);
      if(!id)throw new ParticipationError(429,"REGISTRATION_THROTTLED");
      const salt=randomBytes(16),bytes=await this.derivePassword(input.password,salt,64,SCRYPT);let passwordHash:string;
      try{passwordHash=bytes.toString("hex");}finally{bytes.fill(0);}
      const confirmation=randomBytes(32).toString("base64url"),delivery=randomUUID(),envelope=this.vault.seal(delivery,confirmation);
      // Hashing/encryption and all eventual delivery are OUTSIDE SQL locks.
      await accountTransaction(this.pool,async c=>{await c.query("SELECT pedpsy.queue_registration_confirmation($1,$2,$3,$4,$5,$6,$7)",
        [id,tokenHash(pendingToken),salt.toString("hex"),passwordHash,tokenHash(confirmation),delivery,envelope]);});
      return {status:"confirmation_requested"};
    });
  }
}
