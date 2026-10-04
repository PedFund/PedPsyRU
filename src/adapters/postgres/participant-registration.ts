import {randomBytes} from "node:crypto";
import type {Pool} from "pg";
import type {ParticipantRegistration,RegistrationStart,RegistrationConfirmation,ParticipantEmailLogin} from "../../ports/participant-registration.js";
import {participantEmail} from "../../ports/contact-email.js";
import {ParticipationError} from "../../ports/errors.js";
import {derive,SCRYPT,validPassword,validToken,equalText,csrfFor} from "../../../storage/access.js";
import {ContactTokenVault} from "../security/contact-token-vault.js";
import {PostgresRegistrationStart} from "./registration-start.js";
import {accountTransaction,tokenHash} from "./account-transaction.js";
interface Material {throttled:boolean;credential_id:string;credential_version:number;salt:string;password_hash:string;contact_id:string}
// Persistence-only composition. HTTP/CSRF/delivery/bootstrap wiring follows in
// its own small block. No identity is created or asserted on a GET.
export class PostgresParticipantRegistration implements ParticipantRegistration {
  private deriving=false;
  private readonly dummySalt=randomBytes(16);
  private readonly dummyHash=randomBytes(64).toString("hex");
  private readonly issuance:PostgresRegistrationStart;
  constructor(private readonly pool:Pool,vault:ContactTokenVault,private readonly derivePassword=derive){
    this.issuance=new PostgresRegistrationStart(pool,vault,derivePassword);
  }
  landing(inviteToken:string){return this.issuance.landing(inviteToken);}
  async start(inviteToken:string,input:RegistrationStart,pendingToken:string):Promise<{status:"confirmation_requested"}>{
    if(this.deriving)throw new ParticipationError(429,"REGISTRATION_THROTTLED");this.deriving=true;
    try{return await this.issuance.start(inviteToken,input,pendingToken);}finally{this.deriving=false;}
  }
  async confirm(inviteToken:string,input:RegistrationConfirmation,pendingToken:string):Promise<{status:"sign_in_required"}>{
    if(!validToken(inviteToken)||!validToken(pendingToken)||!input||Array.isArray(input)||Object.keys(input).join(",")!=="confirmation_token"||!validToken(input.confirmation_token))throw new ParticipationError(404,"NOT_AVAILABLE");
    const accepted=await accountTransaction(this.pool,async c=>(await c.query<{accepted:boolean}>("SELECT pedpsy.confirm_registration_email($1,$2,$3) accepted",
      [tokenHash(inviteToken),tokenHash(pendingToken),tokenHash(input.confirmation_token)])).rows[0]!.accepted);
    // Wrong attempts and their mandatory denial audit must commit first.
    if(!accepted)throw new ParticipationError(404,"NOT_AVAILABLE");
    return {status:"sign_in_required"};
  }
  async login(input:ParticipantEmailLogin){
    if(!input||Array.isArray(input)||Object.keys(input).sort().join(",")!=="email,password,study_id"||typeof input.study_id!=="string"||
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(input.study_id)||!validPassword(input.password)||/[\u0000-\u001f\u007f]/.test(input.password))throw new ParticipationError(400,"INVALID_REGISTRATION_INPUT");
    const email=participantEmail(input.email);if(!email.endsWith("@example.test"))throw new ParticipationError(400,"SYNTHETIC_CONTACT_REQUIRED");
    if(this.deriving)throw new ParticipationError(429,"LOGIN_THROTTLED");this.deriving=true;
    try{
      const material=await accountTransaction(this.pool,async c=>(await c.query<Material>("SELECT * FROM pedpsy.participant_email_login_material($1,$2)",[input.study_id,email])).rows[0]);
      if(material?.throttled)throw new ParticipationError(429,"LOGIN_THROTTLED");
      const bytes=await this.derivePassword(input.password,material?Buffer.from(material.salt,"hex"):this.dummySalt,64,SCRYPT);let matches:boolean;
      try{matches=equalText(bytes.toString("hex"),material?.password_hash??this.dummyHash);}finally{bytes.fill(0);}
      const token=randomBytes(32).toString("base64url");
      const expiry=await accountTransaction(this.pool,async c=>(await c.query<{expiry:string|null}>("SELECT pedpsy.finish_participant_email_login($1,$2,$3,$4,$5) expiry",
        [matches?material?.credential_id:null,matches?material?.credential_version:null,matches?material?.password_hash:null,matches?material?.contact_id:null,tokenHash(token)])).rows[0]!.expiry);
      if(!expiry)throw new ParticipationError(401,"INVALID_LOGIN");return {token,csrf:csrfFor(token),expiresAt:Number(expiry)};
    }finally{this.deriving=false;}
  }
}
