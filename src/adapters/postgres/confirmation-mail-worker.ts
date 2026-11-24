import type {Pool} from "pg";
import {ContactTokenVault} from "../security/contact-token-vault.js";
import {MailRateLimiter} from "../mail-rate-limiter.js";
import {accountTransaction} from "./account-transaction.js";

export interface ConfirmationMailTransport {
  send(message: {to: string; subject: string; text: string}): Promise<void>;
}
export interface ConfirmationMailSettings {
  readonly batch: number;
  readonly pollMs: number;
  readonly allowlist: ReadonlySet<string> | null;
  readonly rateLimit: number;
  readonly rateWindowMs: number;
}
interface OutboxRow {
  id: string;
  pending_id: string;
  study_id: string;
  recipient: string;
  token_envelope: string;
  expires_at_ms: string;
  attempts: number;
  study_title: string;
  group_name: string;
}
// At-least-once delivery of the encrypted one-time confirmation code. The
// worker never logs the recipient, the code or SMTP error text: only the
// durable audit row records a fixed reason code. A crash after send can repeat
// the same code, never mint or replay a session.
export class ConfirmationMailWorker {
  private timer: NodeJS.Timeout | undefined;
  private running = false;
  private stopped = false;
  private readonly rate: MailRateLimiter;
  constructor(private readonly pool: Pool, private readonly vault: ContactTokenVault,
    private readonly transport: ConfirmationMailTransport, private readonly settings: ConfirmationMailSettings,
    private readonly appUrl: string) {
    this.rate = new MailRateLimiter(settings.rateLimit, settings.rateWindowMs);
  }
  start(): void {
    if (this.timer) return;
    this.stopped = false;
    this.timer = setInterval(() => { void this.tick().catch(() => { /* durable audit is the record */ }); }, this.settings.pollMs);
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
      await accountTransaction(this.pool, async client => { await client.query("SELECT pedpsy.fail_stale_registration_confirmations()"); });
      const available = this.rate.available();
      if (available <= 0) return 0;
      const rows = await accountTransaction(this.pool, async client =>
        (await client.query<OutboxRow>("SELECT * FROM pedpsy.claim_registration_confirmations($1)", [Math.min(this.settings.batch, available)])).rows);
      for (const row of rows) await this.deliver(row);
      return rows.length;
    } finally {
      this.running = false;
    }
  }
  private async deliver(row: OutboxRow): Promise<void> {
    const now = Date.now(), expires = Number(row.expires_at_ms), attempts = Number(row.attempts);
    const finish = async (sent: boolean, next: number, reason: string): Promise<void> => {
      await accountTransaction(this.pool, async client => {
        await client.query("SELECT pedpsy.finish_registration_confirmation($1,$2,$3,$4)", [row.id, sent, next, reason]);
      });
    };
    if (expires <= now) return finish(false, now, "EXPIRED");
    if (this.settings.allowlist && !this.settings.allowlist.has(row.recipient.toLowerCase())) return finish(false, now, "RECIPIENT_NOT_ALLOWED");
    let code: string;
    try { code = this.vault.open(row.id, row.token_envelope); }
    catch { return finish(false, now, "INVALID_ENVELOPE"); }
    if (!this.rate.take()) return finish(false, now + this.settings.pollMs, "RATE_DEFERRED");
    try {
      await this.transport.send(this.message(row, code));
      await finish(true, now, "SENT");
    } catch {
      if (attempts >= 10) return finish(false, now, "MAX_ATTEMPTS");
      const backoff = Math.min(30000 * 2 ** (attempts - 1), 3600000), next = now + backoff;
      await finish(false, next, next >= expires ? "EXPIRED" : "SMTP_ERROR");
    }
  }
  private message(row: OutboxRow, code: string): {to: string; subject: string; text: string} {
    const title = row.study_title.length > 120 ? row.study_title.slice(0, 117) + "..." : row.study_title;
    const group = row.group_name.length > 100 ? row.group_name.slice(0, 97) + "..." : row.group_name;
    const expires = new Date(Number(row.expires_at_ms)).toLocaleString("ru-RU", {timeZone: "Europe/Moscow", dateStyle: "short", timeStyle: "short"});
    const studyUrl = this.appUrl.replace(/\/+$/, "") + "/workspace#study=" + row.study_id;
    return {
      to: row.recipient,
      subject: "Подтверждение участия — " + title,
      text: [
        "Здравствуйте!",
        "",
        "Вы регистрируетесь в исследовании «" + title + "» (группа «" + group + "»).",
        "",
        "Ссылка на исследование: " + studyUrl,
        "",
        "Код подтверждения: " + code,
        "",
        "Откройте ссылку и введите этот код, чтобы завершить регистрацию.",
        "",
        "Код действует до " + expires + " (МСК).",
        "Если вы не регистрировались, просто проигнорируйте это письмо."
      ].join("\r\n")
    };
  }
}
