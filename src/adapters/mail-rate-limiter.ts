export class MailRateLimiter {
  private readonly sent: number[] = [];
  constructor(private readonly limit: number, private readonly windowMs: number) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 1000) throw new Error("INVALID_MAIL_RATE_LIMIT");
    if (!Number.isInteger(windowMs) || windowMs < 60000 || windowMs > 3600000) throw new Error("INVALID_MAIL_RATE_WINDOW");
  }
  available(now = Date.now()): number {
    while (this.sent.length && now - this.sent[0]! >= this.windowMs) this.sent.shift();
    return Math.max(0, this.limit - this.sent.length);
  }
  take(now = Date.now()): boolean {
    if (this.available(now) <= 0) return false;
    this.sent.push(now);
    return true;
  }
}
