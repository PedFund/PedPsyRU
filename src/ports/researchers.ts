import type {LoginSession} from "./identity.js";
export interface ResearcherRecord {id:string;user_id:string;login_id:string;status:"active"|"revoked";active_study_quota:number;display_name:string|null}
export interface ResearcherInvite {login_id:string;invite_code:string;expires_at:number}
export interface ResearcherHome {login_id:string;display_name:string|null;active_study_quota:number;studies:{id:string;title:string;status:string}[]}
export interface ResearcherGateway {
  accept(input:unknown):Promise<{login_id:string}>;
  login(input:unknown):Promise<LoginSession>;
  home(token:string):Promise<ResearcherHome>;
  rename(token:string,input:unknown):Promise<{display_name:string}>;
  logout(token:string,csrf:string):Promise<void>;
}
export interface ResearcherManagement {
  list(token:string):Promise<ResearcherRecord[]>;
  invite(token:string):Promise<ResearcherInvite>;
  block(token:string,credentialId:string):Promise<void>;
}
