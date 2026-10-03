import {randomUUID} from "node:crypto";
import type {Pool} from "pg";
import type {StaffManagement,StaffRecord} from "../../ports/staff-management.js";
import {ParticipationError} from "../../ports/errors.js";
import {withStaffOperation} from "./staff-operation.js";
export class PostgresStaffManagement implements StaffManagement{
  constructor(private readonly pool:Pool){}
  list(token:string){return withStaffOperation(this.pool,token,"staff.roles.assign",async c=>(await c.query<StaffRecord>("SELECT * FROM pedpsy.list_staff_accounts()")).rows);}
  async assign(token:string,input:unknown):Promise<void>{
    if(!input||typeof input!=="object"||Array.isArray(input)||Object.keys(input).sort().join(",")!=="role,user_id")throw new ParticipationError(400,"INVALID_ROLE_ASSIGNMENT");
    const d=input as Record<string,unknown>;
    if(typeof d.user_id!=="string"||!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(d.user_id)||(d.role!=="administrator"&&d.role!=="superadministrator"))throw new ParticipationError(400,"INVALID_ROLE_ASSIGNMENT");
    await withStaffOperation(this.pool,token,"staff.roles.assign",async c=>{await c.query("SELECT pedpsy.assign_staff_role($1,$2,$3)",[d.user_id,d.role,randomUUID()]);});
  }
}
