import {randomBytes} from "node:crypto";
import type {Pool} from "pg";
import type {ParticipantRegistration,RegistrationStart,RegistrationConfirmation,ParticipantEmailLogin,RegistrationResend} from "../../ports/participant-registration.js";
import {participantEmail} from "../../ports/contact-email.js";
import {ParticipationError} from "../../ports/errors.js";
import {derive,SCRYPT,validPassword,validToken,equalText,csrfFor} from "../../../storage/access.js";
import {ContactTokenVault} from "../security/contact-token-vault.js";
import {PostgresRegistrationStart} from "./registration-start.js";
import {accountTransaction,tokenHash} from "./account-transaction.js";
import {LoginLock} from "./login-lock.js";
import {DEFAULT_PARTICIPANT_ADMISSION, type ParticipantAdmissionPolicy} from "../../ports/login-policy.js";
import {DerivationGate} from "../derivation-gate.js";
interface Material {throttled:boolean;credential_id:string;credential_version:number;salt:string;password_hash:string;contact_id:string}
// Persistence-only composition. HTTP/CSRF/delivery/bootstrap wiring follows in
// its own small block. No identity is created or asserted on a GET.
export class PostgresParticipantRegistration implements ParticipantRegistration {
  private readonly gate:DerivationGate;
  private readonly dummySalt=randomBytes(16);
  private readonly dummyHash=randomBytes(64).toString("hex");
  private readonly issuance:PostgresRegistrationStart;
  private readonly lock:LoginLock;
  constructor(private readonly pool:Pool,private readonly vault:ContactTokenVault,private readonly derivePassword=derive,private readonly allowRealEmail=false,
    private readonly admission:ParticipantAdmissionPolicy=DEFAULT_PARTICIPANT_ADMISSION){
    this.issuance=new PostgresRegistrationStart(pool,vault,derivePassword,allowRealEmail,admission);
    this.gate=new DerivationGate(admission.derivationConcurrency,admission.queueLimit,admission.queueTimeoutMs);
    this.lock=new LoginLock(pool);
  }
  landing(inviteToken:string){return this.issuance.landing(inviteToken);}
  async start(inviteToken:string,input:RegistrationStart,pendingToken:string):Promise<{status:"confirmation_requested"}>{
    return this.issuance.start(inviteToken,input,pendingToken);
  }
  async confirm(inviteToken:string,input:RegistrationConfirmation,pendingToken:string):Promise<{status:"sign_in_required"}>{
    if(!validToken(inviteToken)||!validToken(pendingToken)||!input||Array.isArray(input)||Object.keys(input).join(",")!=="confirmation_token"||!validToken(input.confirmation_token))throw new ParticipationError(404,"NOT_AVAILABLE");
    const accepted=await accountTransaction(this.pool,async c=>(await c.query<{accepted:boolean}>("SELECT pedpsy.confirm_registration_email($1,$2,$3) accepted",
      [tokenHash(inviteToken),tokenHash(pendingToken),tokenHash(input.confirmation_token)])).rows[0]!.accepted);
    // Wrong attempts and their mandatory denial audit must commit first.
    if(!accepted)throw new ParticipationError(404,"NOT_AVAILABLE");
    return {status:"sign_in_required"};
  }
  // Resolution by address is only allowed when it is unambiguous. Several active
  // studies with the same address must send the participant back to the group link.
  private async studyForEmail(email:string):Promise<string|undefined>{
    try{
      const row=await accountTransaction(this.pool,async c=>(await c.query<{study:string|null}>("SELECT pedpsy.participant_login_study($1) study",[email])).rows[0]);
      return row?.study??undefined;
    }catch(error){
      const code=(error as {code?:string}).code,message=(error as {message?:string}).message;
      if(code==="P0001"&&message==="AMBIGUOUS_PARTICIPANT_STUDY")throw new ParticipationError(409,"AMBIGUOUS_PARTICIPANT_STUDY");
      throw error;
    }
  }
  async resend(inviteToken:string,input:RegistrationResend):Promise<{status:"accepted"}>{
    if(!validToken(inviteToken)||!input||Array.isArray(input)||Object.keys(input).join(",")!=="email")throw new ParticipationError(400,"INVALID_REGISTRATION_INPUT");
    const email=participantEmail(input.email);
    if(!email.endsWith("@example.test")&&!this.allowRealEmail)throw new ParticipationError(400,"SYNTHETIC_CONTACT_REQUIRED");
    // The queued letter keeps its identity: the envelope is sealed for the same
    // delivery row that will carry the refreshed code.
    const deliveryId=await accountTransaction(this.pool,async c=>
      (await c.query<{id:string|null}>("SELECT pedpsy.registration_resend_target($1,$2) id",[tokenHash(inviteToken),email])).rows[0]?.id);
    if(!deliveryId)return {status:"accepted"};
    const code=randomBytes(32).toString("base64url");
    const outcome=await accountTransaction(this.pool,async c=>
      (await c.query<{outcome:string}>("SELECT pedpsy.reserve_registration_resend($1,$2,$3,$4,$5) outcome",
        [tokenHash(inviteToken),email,deliveryId,tokenHash(code),this.vault.seal(deliveryId,code)])).rows[0]?.outcome);
    if(outcome==="throttled")throw new ParticipationError(429,"RESEND_THROTTLED");
    // 'none' is deliberately indistinguishable from 'ok': an unknown mailbox learns nothing.
    return {status:"accepted"};
  }
  async login(input:ParticipantEmailLogin){
    if(!input||Array.isArray(input))throw new ParticipationError(400,"INVALID_REGISTRATION_INPUT");
    const keys=Object.keys(input).sort().join(",");
    if(keys!=="email,password"&&keys!=="email,password,study_id")throw new ParticipationError(400,"INVALID_REGISTRATION_INPUT");
    if(input.study_id!==undefined&&(typeof input.study_id!=="string"||
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(input.study_id)))throw new ParticipationError(400,"INVALID_REGISTRATION_INPUT");
    if(!validPassword(input.password)||/[\u0000-\u001f\u007f]/.test(input.password))throw new ParticipationError(400,"INVALID_REGISTRATION_INPUT");
    const email=participantEmail(input.email);if(!email.endsWith("@example.test")&&!this.allowRealEmail)throw new ParticipationError(400,"SYNTHETIC_CONTACT_REQUIRED");
    const scope="participant-email",identity=email;
    if(await this.lock.blocked(scope,identity))throw new ParticipationError(429,"LOGIN_LOCKED");
    try{
      const studyId=input.study_id??await this.studyForEmail(email);
      if(!studyId)throw new ParticipationError(401,"INVALID_LOGIN");
      const session=await this.gate.run(async()=>{
        const material=await accountTransaction(this.pool,async c=>(await c.query<Material>("SELECT * FROM pedpsy.participant_email_login_material_v2($1,$2,$3,$4,$5)",[studyId,email,this.allowRealEmail,this.admission.globalLimit,this.admission.globalWindowMs])).rows[0]);
        if(material?.throttled)throw new ParticipationError(429,"LOGIN_THROTTLED");
        const bytes=await this.derivePassword(input.password,material?Buffer.from(material.salt,"hex"):this.dummySalt,64,SCRYPT);let matches:boolean;
        try{matches=equalText(bytes.toString("hex"),material?.password_hash??this.dummyHash);}finally{bytes.fill(0);}
        const token=randomBytes(32).toString("base64url");
        const expiry=await accountTransaction(this.pool,async c=>(await c.query<{expiry:string|null}>("SELECT pedpsy.finish_participant_email_login($1,$2,$3,$4,$5) expiry",
          [matches?material?.credential_id:null,matches?material?.credential_version:null,matches?material?.password_hash:null,matches?material?.contact_id:null,tokenHash(token)])).rows[0]!.expiry);
        if(!expiry)throw new ParticipationError(401,"INVALID_LOGIN");return {token,csrf:csrfFor(token),expiresAt:Number(expiry)};
      });
      await this.lock.success(scope,identity);
      return session;
    }catch(error){
      if(error instanceof ParticipationError&&["INVALID_LOGIN","LOGIN_THROTTLED"].includes(error.code))await this.lock.failure(scope,identity);
      throw error;
    }
  }
}
