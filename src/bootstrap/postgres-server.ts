import {Pool} from "pg";
import {randomUUID} from "node:crypto";
import {responsesDigest} from "../../storage/releases.js";
import {PostgresUnitOfWork} from "../adapters/postgres/unit-of-work.js";
import {PostgresParticipantGateway} from "../adapters/postgres/identity.js";
import {createParticipationService} from "../application/participation.js";
import {createParticipantApi} from "../application/participant-api.js";
import {createParticipantApp} from "../http/participant-app.js";
import {demoConfig} from "./demo-config.js";
async function main(): Promise<void> {
  let pool:Pool|undefined;
  try {
    pool=new Pool(demoConfig(process.env));const uow=new PostgresUnitOfWork(pool);
    const api=createParticipantApi(new PostgresParticipantGateway(pool,uow),createParticipationService(uow,
      {newId:randomUUID,now:()=>new Date().toISOString(),digest:(ids,values)=>responsesDigest(ids.map(item_id=>({item_id})),values)}));
    const app=createParticipantApp(api,"http://127.0.0.1:4174");
    app.addHook("onClose",async()=>{await pool?.end();});
    const close=():void=>{void app.close();};process.once("SIGINT",close);process.once("SIGTERM",close);
    try {await app.listen({host:"127.0.0.1",port:4174});} catch {await app.close();throw new Error("DEMO_START_FAILED");}
  } catch {await pool?.end().catch(()=>{});process.exitCode=1;console.error("Synthetic PostgreSQL configuration required or unavailable; no data migrated.");}
}
void main();
