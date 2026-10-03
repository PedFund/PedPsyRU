import {randomBytes} from "node:crypto";
import type {Pool} from "pg";
import {validToken,csrfFor,equalText} from "../../../storage/access.js";
import type {StaffMfaGateway} from "../../ports/staff-auth.js";
import {ParticipationError} from "../../ports/errors.js";
import {MfaVault} from "../security/mfa-vault.js";
import {base32,matchingStep} from "../security/totp.js";
import {PostgresStaffPassword} from "./staff-password.js";
import {accountTransaction,tokenHash} from "./account-transaction.js";
interface Material{credential_id:string;secret_envelope:string;confirmed:boolean;last_step:string;at_ms:string}
export class PostgresStaffMfa implements StaffMfaGateway{
  private readonly passwords:PostgresStaffPassword;
  constructor(private readonly pool:Pool,private readonly vault:MfaVault){this.passwords=new PostgresStaffPassword(pool);}
  password(input:unknown){return this.passwords.password(input);}
  async enroll(challenge:string){
    if(!validToken(challenge))throw new ParticipationError(401,"AUTH_REQUIRED");
    const credential=await accountTransaction(this.pool,async c=>(await c.query<{id:string|null}>("SELECT pedpsy.staff_challenge_identity($1) id",[tokenHash(challenge)])).rows[0]?.id);
    if(!credential)throw new ParticipationError(401,"AUTH_REQUIRED");
    const secret=randomBytes(20);
    try{
      const envelope=this.vault.seal(credential,secret);
      const created=await accountTransaction(this.pool,async c=>(await c.query<{id:string|null}>("SELECT pedpsy.begin_staff_enrollment($1,$2) id",[tokenHash(challenge),envelope])).rows[0]?.id);
      if(!created)throw new ParticipationError(409,"MFA_ENROLLMENT_EXISTS");
      return {secret:base32(secret),issuer:"PedPsyRU",account:credential};
    }catch(e){if(e&&typeof e==="object"&&"code"in e&&e.code==="42501")throw new ParticipationError(403,"MFA_ALREADY_ENROLLED");throw e;}
    finally{secret.fill(0);}
  }
  async verify(challenge:string,input:unknown){
    if(!validToken(challenge))throw new ParticipationError(401,"AUTH_REQUIRED");
    if(!input||typeof input!=="object"||Array.isArray(input)||Object.keys(input).sort().join(",")!=="code,type")throw new ParticipationError(400,"INVALID_MFA");
    const d=input as Record<string,unknown>;
    if((d.type!=="totp"&&d.type!=="recovery")||typeof d.code!=="string"||!(d.type==="totp"?/^[0-9]{6}$/:/^[a-f0-9]{32}$/).test(d.code))throw new ParticipationError(400,"INVALID_MFA");
    const m=await accountTransaction(this.pool,async c=>(await c.query<Material>("SELECT * FROM pedpsy.staff_mfa_material($1)",[tokenHash(challenge)])).rows[0]);
    let step:number|null=null;
    if(m&&d.type==="totp"){
      const secret=this.vault.open(m.credential_id,m.secret_envelope);
      try{step=matchingStep(secret,d.code,Number(m.at_ms));}finally{secret.fill(0);}
    }
    const recoveryCodes=m&&!m.confirmed&&step!==null?Array.from({length:8},()=>randomBytes(16).toString("hex")):[];
    const hashes=recoveryCodes.map(code=>tokenHash(m!.credential_id+":"+code)),token=randomBytes(32).toString("base64url");
    const expiresAt=await accountTransaction(this.pool,async c=>(await c.query<{expiry:string|null}>("SELECT pedpsy.finish_staff_mfa($1,$2,$3,$4,$5) expiry",
      [tokenHash(challenge),step,m&&d.type==="recovery"?tokenHash(m.credential_id+":"+d.code):null,tokenHash(token),hashes])).rows[0]?.expiry);
    if(!expiresAt)throw new ParticipationError(401,"INVALID_MFA");
    return {token,csrf:csrfFor(token),expiresAt:Number(expiresAt),...(recoveryCodes.length?{recoveryCodes}:{})};
  }
  async logout(token:string,csrf:string):Promise<void>{
    if(!validToken(token)||!equalText(csrf,csrfFor(token)))throw new ParticipationError(403,"CSRF_REJECTED");
    await accountTransaction(this.pool,async c=>{await c.query("SELECT set_config('app.session_hash',$1,true)",[tokenHash(token)]);await c.query("SELECT pedpsy.logout_staff()");});
  }
}
