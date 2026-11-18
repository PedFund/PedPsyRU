import {randomBytes} from "node:crypto";
import type {Pool} from "pg";
import {derive,SCRYPT,validLogin,validPassword,equalText} from "../../../storage/access.js";
import type {PendingStaffLogin,StaffPasswordGateway} from "../../ports/staff-auth.js";
import {ParticipationError} from "../../ports/errors.js";
import {accountTransaction,tokenHash} from "./account-transaction.js";
import {LoginLock} from "./login-lock.js";
interface Material{throttled:boolean;credential_id:string;credential_version:number;salt:string;password_hash:string}
export class PostgresStaffPassword implements StaffPasswordGateway{
  private deriving=false;
  private readonly lock:LoginLock;
  private readonly dummySalt=randomBytes(16);
  private readonly dummyHash=randomBytes(64).toString("hex");
  constructor(private readonly pool:Pool,private readonly derivePassword=derive){this.lock=new LoginLock(pool);}
  async password(input:unknown):Promise<PendingStaffLogin>{
    if(!input||typeof input!=="object"||Array.isArray(input)||Object.keys(input).sort().join(",")!=="login_id,password")throw new ParticipationError(400,"INVALID_LOGIN");
    const d=input as Record<string,unknown>;
    if(!validLogin(d.login_id)||!validPassword(d.password))throw new ParticipationError(400,"INVALID_LOGIN");
    const scope="staff",identity=d.login_id as string;
    if(await this.lock.blocked(scope,identity))throw new ParticipationError(429,"LOGIN_LOCKED");
    if(this.deriving)throw new ParticipationError(429,"LOGIN_THROTTLED");this.deriving=true;
    try{
      const m=await accountTransaction(this.pool,async c=>(await c.query<Material>("SELECT * FROM pedpsy.staff_login_material($1)",[d.login_id])).rows[0]);
      if(m?.throttled)throw new ParticipationError(429,"LOGIN_THROTTLED");
      const b=await this.derivePassword(d.password,m?Buffer.from(m.salt,"hex"):this.dummySalt,64,SCRYPT);
      const matches=equalText(b.toString("hex"),m?.password_hash??this.dummyHash);b.fill(0);
      const challenge=randomBytes(32).toString("base64url");
      const expiry=await accountTransaction(this.pool,async c=>(await c.query<{expiry:string|null}>("SELECT pedpsy.finish_staff_password($1,$2,$3,$4) expiry",[matches?m?.credential_id:null,matches?m?.credential_version:null,matches?m?.password_hash:null,tokenHash(challenge)])).rows[0]?.expiry);
      if(!expiry)throw new ParticipationError(401,"INVALID_LOGIN");
      await this.lock.success(scope,identity);
      return {challenge,expiresAt:Number(expiry),status:"mfa_required"};
    }catch(error){
      if(error instanceof ParticipationError&&["INVALID_LOGIN","LOGIN_THROTTLED"].includes(error.code))await this.lock.failure(scope,identity);
      throw error;
    }finally{this.deriving=false;}
  }
}
