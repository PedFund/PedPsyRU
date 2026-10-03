import type {Pool,PoolClient} from "pg";
import {createHash} from "node:crypto";
import {assertRuntimeClient,mapPostgresError} from "./unit-of-work.js";
export const tokenHash=(value:string):string=>"sha256:"+createHash("sha256").update(value).digest("hex");
export async function accountTransaction<T>(pool:Pool,callback:(client:PoolClient)=>Promise<T>):Promise<T>{
  const client=await pool.connect();
  try{await assertRuntimeClient(client);await client.query("BEGIN");
    try{await client.query("SELECT set_config('statement_timeout','5000',true),set_config('lock_timeout','3000',true),set_config('idle_in_transaction_session_timeout','10000',true)");
      const result=await callback(client);await client.query("COMMIT");return result;
    }catch(e){await client.query("ROLLBACK");throw e;}
  }catch(e){throw mapPostgresError(e);}finally{client.release();}
}
