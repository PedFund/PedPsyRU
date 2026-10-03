export type StaffRole="administrator"|"superadministrator";
export interface StaffRecord{id:string;user_id:string;login_id:string;role:StaffRole;status:string}
export interface StaffManagement{list(token:string):Promise<StaffRecord[]>;assign(token:string,input:unknown):Promise<void>}
