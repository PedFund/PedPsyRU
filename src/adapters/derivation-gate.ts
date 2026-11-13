import {ParticipationError} from "../ports/errors.js";
interface Waiter {resolve:(acquired:boolean)=>void;timer:NodeJS.Timeout}
// Bounded in-process admission for password derivation. The production default
// keeps the old single-flight behaviour (queueLimit=0 -> immediate 429); an
// explicit pilot may queue a bounded number of requests instead of rejecting
// them all at once. The durable SQL bucket remains the cross-process limit.
export class DerivationGate {
  private active = 0;
  private readonly waiting: Waiter[] = [];
  constructor(private readonly concurrency: number, private readonly queueLimit: number, private readonly queueTimeoutMs: number,
    private readonly errorCode: "LOGIN_THROTTLED" | "REGISTRATION_THROTTLED" = "LOGIN_THROTTLED") {}
  async run<T>(work: () => Promise<T>): Promise<T> {
    if (!(await this.acquire())) throw new ParticipationError(429, this.errorCode);
    try { return await work(); } finally { this.release(); }
  }
  private acquire(): Promise<boolean> | boolean {
    if (this.active < this.concurrency) { this.active++; return true; }
    if (this.waiting.length >= this.queueLimit) return false;
    return new Promise<boolean>(resolve => {
      const waiter: Waiter = {resolve, timer: setTimeout(() => {
        const index = this.waiting.indexOf(waiter);
        if (index >= 0) this.waiting.splice(index, 1);
        resolve(false);
      }, this.queueTimeoutMs)};
      this.waiting.push(waiter);
    });
  }
  private release(): void {
    this.active--;
    while (this.active < this.concurrency && this.waiting.length) {
      const waiter = this.waiting.shift()!;
      clearTimeout(waiter.timer);
      this.active++;
      waiter.resolve(true);
    }
  }
}
