import type {Pool} from "pg";
import type {RegistrationDenials} from "../../ports/registration-browser.js";
import {accountTransaction} from "./account-transaction.js";
export class PostgresRegistrationDenials implements RegistrationDenials{
  constructor(private readonly pool:Pool){}
  async record(reason:string):Promise<void>{
    if(typeof reason!=="string"||! /^[A-Z][A-Z0-9_]{0,63}$/.test(reason))throw new Error("INVALID_REGISTRATION_AUDIT_REASON");
    await accountTransaction(this.pool,async c=>{await c.query("SELECT pedpsy.record_registration_http_denial($1)",[reason]);});
  }
}
