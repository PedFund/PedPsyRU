import type {Pool,PoolClient} from "pg";
import {createHash} from "node:crypto";
import {assertRuntimeClient,mapPostgresError} from "./unit-of-work.js";
import {ParticipationError} from "../../ports/errors.js";
export const tokenHash=(value:string):string=>"sha256:"+createHash("sha256").update(value).digest("hex");
export async function accountTransaction<T>(pool:Pool,callback:(client:PoolClient)=>Promise<T>):Promise<T>{
  const client=await pool.connect();
  try{await assertRuntimeClient(client);await client.query("BEGIN");
    try{await client.query("SELECT set_config('statement_timeout','5000',true),set_config('lock_timeout','3000',true),set_config('idle_in_transaction_session_timeout','10000',true)");
      const result=await callback(client);await client.query("COMMIT");return result;
    }catch(e){await client.query("ROLLBACK");throw e;}
  }catch(e){
    if(e&&typeof e==="object"&&"code"in e&&"message"in e){
      if(e.code==="42501"&&["FORBIDDEN","MFA_RECHECK_REQUIRED","SELF_ROLE_CHANGE_FORBIDDEN","LAST_SUPERADMIN_REQUIRED"].includes(String(e.message)))throw new ParticipationError(403,String(e.message));
      if(e.code==="54000"&&["INVITE_THROTTLED","EXPORT_LIMIT"].includes(String(e.message)))throw new ParticipationError(e.message==="INVITE_THROTTLED"?429:413,String(e.message));
      if(e.code==="22023"&&e.message==="INVALID_STUDY_INPUT")throw new ParticipationError(400,"INVALID_STUDY_INPUT");
      if(e.code==="54000"&&e.message==="DESIGN_LIMIT")throw new ParticipationError(413,"DESIGN_LIMIT");
      if(e.code==="P0001"&&["DESIGN_CONFLICT","DESIGN_FROZEN","STUDY_QUOTA","DESIGN_INCOMPLETE","DESIGN_DUPLICATE"].includes(String(e.message)))throw new ParticipationError(409,String(e.message));
    }
    throw mapPostgresError(e);
  }finally{client.release();}
}
