import type {Pool} from "pg";
import type {StaffDiagnostics,DiagnosticSnapshot,ProtocolSummary} from "../../ports/staff-diagnostics.js";
import {ParticipationError} from "../../ports/errors.js";
import {withStaffOperation} from "./staff-operation.js";
export class PostgresStaffDiagnostics implements StaffDiagnostics{
  constructor(private readonly pool:Pool){}
  list(token:string){return withStaffOperation(this.pool,token,"protocols.read",async c=>(await c.query<ProtocolSummary>("SELECT * FROM pedpsy.staff_protocol_summary()")).rows);}
  private async snapshot(token:string,id:string|undefined,exported:boolean):Promise<DiagnosticSnapshot>{
    if(id!==undefined&&!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(id))throw new ParticipationError(404,"NOT_AVAILABLE");
    return withStaffOperation(this.pool,token,exported?"protocols.download":"protocols.read",async c=>{
      const data=(await c.query<{data:DiagnosticSnapshot}>("SELECT pedpsy.staff_diagnostic_snapshot($1,$2) data",[id??null,exported])).rows[0]!.data;
      if(Buffer.byteLength(JSON.stringify(data),"utf8")>4194304)throw new ParticipationError(413,"EXPORT_LIMIT");return data;
    });
  }
  async read(token:string,id:string){return (await this.snapshot(token,id,false)).protocols[0]!;}
  download(token:string,id?:string){return this.snapshot(token,id,true);}
}
