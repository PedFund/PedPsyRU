import type {Pool} from "pg";
import {accountTransaction} from "./account-transaction.js";

// Identity-level lockout shared by every login path. The identity itself is
// hashed inside PostgreSQL; this class only passes the scope and the raw login
// identifier for hashing and never stores it.
export class LoginLock {
  constructor(private readonly pool: Pool) {}
  private async call<T>(sql: string, args: unknown[]): Promise<T> {
    return accountTransaction(this.pool, async client => (await client.query<{value: T}>(sql, args)).rows[0]!.value);
  }
  blocked(scope: string, identity: string): Promise<boolean> {
    return this.call<boolean>("SELECT pedpsy.login_lock_blocked($1,$2) value", [scope, identity]);
  }
  failure(scope: string, identity: string): Promise<number> {
    return this.call<number>("SELECT pedpsy.login_lock_failure($1,$2) value", [scope, identity]);
  }
  success(scope: string, identity: string): Promise<void> {
    return this.call<void>("SELECT pedpsy.login_lock_success($1,$2) value", [scope, identity]);
  }
}
