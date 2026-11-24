import type {Pool} from "pg";
import {MailRateLimiter} from "../mail-rate-limiter.js";

export interface ReminderTransport {
  send(message: {to: string; subject: string; text: string}): Promise<void>;
}
export interface ReminderWorkerSettings {
  readonly batch: number;
  readonly pollMs: number;
  readonly allowlist: ReadonlySet<string> | null;
  readonly rateLimit: number;
  readonly rateWindowMs: number;
}
interface ReminderRow {
  study_id: string;
  request_id: string;
  participant_id: string;
  stage_id: string;
  email: string;
  message: string;
  created_at_ms: string;
}

// Delivers queued researcher reminders. The immutable outbox is never updated;
// a separate delivery row is inserted only after SMTP accepted the message.
// A crash between send and mark can repeat one reminder; the outbox is immutable
// and no alternative durable claim is available without changing that history.
export class ResearchReminderWorker {
  private timer: NodeJS.Timeout | undefined;
  private running = false;
  private stopped = false;
  private readonly rate: MailRateLimiter;
  constructor(private readonly pool: Pool, private readonly transport: ReminderTransport,
    private readonly settings: ReminderWorkerSettings) {
    this.rate = new MailRateLimiter(settings.rateLimit, settings.rateWindowMs);
  }
  start(): void {
    if (this.timer) return;
    this.stopped = false;
    this.timer = setInterval(() => { void this.tick().catch(() => { /* fixed errors are not logged with recipients */ }); }, this.settings.pollMs);
    this.timer.unref();
    void this.tick().catch(() => { /* first pass is best effort */ });
  }
  stop(): void {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }
  async tick(): Promise<number> {
    if (this.running || this.stopped) return 0;
    this.running = true;
    try {
      const available = this.rate.available();
      if (available <= 0) return 0;
      const rows = (await this.pool.query<ReminderRow>(
        "SELECT study_id,request_id,participant_id,stage_id,email,message,created_at_ms FROM pedpsy.read_pending_research_reminders($1)",
        [Math.min(this.settings.batch, available)])).rows;
      let sent = 0;
      for (const row of rows) {
        if (this.settings.allowlist && !this.settings.allowlist.has(row.email.toLowerCase())) continue;
        if (!this.rate.take()) break;
        await this.transport.send({
          to: row.email,
          subject: "Напоминание о прохождении исследования — МетодТест",
          text: row.message
        });
        await this.pool.query(
          "SELECT pedpsy.mark_research_reminder_sent($1,$2,$3,$4,$5)",
          [row.study_id, row.request_id, row.participant_id, row.stage_id, Date.now()]);
        sent++;
      }
      return sent;
    } finally {
      this.running = false;
    }
  }
}
