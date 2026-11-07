import {randomBytes,randomUUID} from "node:crypto";
import type {Pool} from "pg";
import {derive,SCRYPT,validLogin,validPassword,validToken,equalText,csrfFor} from "../../../storage/access.js";
import type {ResearcherGateway,ResearcherManagement,ResearcherHome,ResearcherRecord} from "../../ports/researchers.js";
import {ParticipationError} from "../../ports/errors.js";
import {accountTransaction,tokenHash} from "./account-transaction.js";
import {withStaffOperation} from "./staff-operation.js";
interface Material{throttled:boolean;credential_id:string;credential_version:number;salt:string;password_hash:string}
export class PostgresResearcherManagement implements ResearcherManagement{
  constructor(private readonly pool:Pool){}
  list(token:string){return withStaffOperation(this.pool,token,"researchers.read",async c=>(await c.query<ResearcherRecord>("SELECT * FROM pedpsy.list_researchers()")).rows);}
  invite(token:string){return withStaffOperation(this.pool,token,"researchers.invite",async c=>{
    const login_id="R-"+randomBytes(8).toString("hex").toUpperCase(),invite_code=randomBytes(32).toString("base64url");
    const result=await c.query<{expiry:string}>("SELECT pedpsy.invite_researcher($1,$2,$3,$4,$5,$6) expiry",[randomUUID(),randomUUID(),login_id,tokenHash(invite_code),randomBytes(16).toString("hex"),randomBytes(64).toString("hex")]);
    return {login_id,invite_code,expires_at:Number(result.rows[0]!.expiry)};
  });}
  async block(token:string,id:string):Promise<void>{
    if(!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(id))throw new ParticipationError(404,"NOT_AVAILABLE");
    await withStaffOperation(this.pool,token,"researchers.block",async c=>{await c.query("SELECT pedpsy.block_researcher($1)",[id]);});
  }
}
export class PostgresResearcherGateway implements ResearcherGateway{
  private deriving=false;
  private readonly dummySalt=randomBytes(16);private readonly dummyHash=randomBytes(64).toString("hex");
  constructor(private readonly pool:Pool,private readonly derivePassword=derive){}
  async accept(input:unknown):Promise<{login_id:string}>{
    if(!input||typeof input!=="object"||Array.isArray(input)||Object.keys(input).sort().join(",")!=="invite_code,password")throw new ParticipationError(400,"INVALID_INVITE");
    const d=input as Record<string,unknown>;if(typeof d.invite_code!=="string"||!validToken(d.invite_code)||!validPassword(d.password))throw new ParticipationError(400,"INVALID_INVITE");
    const inviteCode=d.invite_code;
    if(this.deriving)throw new ParticipationError(429,"LOGIN_THROTTLED");this.deriving=true;
    try{
      const allowed=await accountTransaction(this.pool,async c=>(await c.query<{allowed:boolean}>("SELECT pedpsy.reserve_invite_attempt($1) allowed",[tokenHash(inviteCode)])).rows[0]?.allowed);
      if(!allowed)throw new ParticipationError(429,"LOGIN_THROTTLED");
      const salt=randomBytes(16),b=await this.derivePassword(d.password,salt,64,SCRYPT),hash=b.toString("hex");b.fill(0);
      const loginId=await accountTransaction(this.pool,async c=>(await c.query<{login_id:string|null}>("SELECT pedpsy.accept_researcher_invite($1,$2,$3) login_id",[tokenHash(inviteCode),salt.toString("hex"),hash])).rows[0]?.login_id);
      if(!loginId)throw new ParticipationError(401,"INVALID_INVITE");return {login_id:loginId};
    }finally{this.deriving=false;}
  }
  async login(input:unknown){
    if(!input||typeof input!=="object"||Array.isArray(input)||Object.keys(input).sort().join(",")!=="login_id,password")throw new ParticipationError(400,"INVALID_LOGIN");
    const d=input as Record<string,unknown>;if(!validLogin(d.login_id)||!validPassword(d.password))throw new ParticipationError(400,"INVALID_LOGIN");
    if(this.deriving)throw new ParticipationError(429,"LOGIN_THROTTLED");this.deriving=true;
    try{
      const m=await accountTransaction(this.pool,async c=>(await c.query<Material>("SELECT * FROM pedpsy.researcher_login_material($1)",[d.login_id])).rows[0]);
      if(m?.throttled)throw new ParticipationError(429,"LOGIN_THROTTLED");
      const b=await this.derivePassword(d.password,m?Buffer.from(m.salt,"hex"):this.dummySalt,64,SCRYPT),matches=equalText(b.toString("hex"),m?.password_hash??this.dummyHash);b.fill(0);
      const token=randomBytes(32).toString("base64url");
      const expiry=await accountTransaction(this.pool,async c=>(await c.query<{expiry:string|null}>("SELECT pedpsy.finish_researcher_login($1,$2,$3,$4) expiry",[matches?m?.credential_id:null,matches?m?.credential_version:null,matches?m?.password_hash:null,tokenHash(token)])).rows[0]?.expiry);
      if(!expiry)throw new ParticipationError(401,"INVALID_LOGIN");return {token,csrf:csrfFor(token),expiresAt:Number(expiry)};
    }finally{this.deriving=false;}
  }
  async home(token:string):Promise<ResearcherHome>{
    if(!validToken(token))throw new ParticipationError(401,"AUTH_REQUIRED");return accountTransaction(this.pool,async c=>{
      await c.query("SELECT set_config('app.session_hash',$1,true)",[tokenHash(token)]);return (await c.query<{data:ResearcherHome}>("SELECT pedpsy.researcher_home() data")).rows[0]!.data;
    });
  }
  async logout(token:string,csrf:string):Promise<void>{
    if(!validToken(token)||!equalText(csrf,csrfFor(token)))throw new ParticipationError(403,"CSRF_REJECTED");await accountTransaction(this.pool,async c=>{
      await c.query("SELECT set_config('app.session_hash',$1,true)",[tokenHash(token)]);await c.query("SELECT pedpsy.logout_researcher()");
    });
  }
}
