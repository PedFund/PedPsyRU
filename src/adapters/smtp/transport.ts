import {randomUUID} from "node:crypto";
import {connect as netConnect, type Socket} from "node:net";
import {connect as tlsConnect} from "node:tls";

export interface SmtpMessage {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
}
export interface SmtpOptions {
  readonly host: string;
  readonly port: number;
  readonly tls: "implicit" | "none";
  readonly user: string;
  readonly password: string;
  readonly from: string;
  readonly fromName?: string;
  readonly replyTo?: string;
  readonly timeoutMs?: number;
  readonly ehloName?: string;
}
export type SmtpStage = "CONFIG" | "CONNECT" | "GREETING" | "EHLO" | "AUTH" | "MAIL" | "RCPT" | "DATA" | "QUIT" | "TIMEOUT" | "VALIDATION";
export class SmtpError extends Error {
  constructor(readonly stage: SmtpStage, readonly smtpCode?: number) {
    super("SMTP_" + stage);
    this.name = "SmtpError";
  }
}
interface Response {readonly code: number;readonly lines: readonly string[]}
const EMAIL = /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/;
function address(value: string): string {
  if (value.length > 254 || !EMAIL.test(value) || /[\u0000-\u001f\u007f]/.test(value)) throw new SmtpError("VALIDATION");
  return value;
}
function header(value: string, max: number): string {
  if (value.length > max || /[\u0000-\u001f\u007f]/.test(value)) throw new SmtpError("VALIDATION");
  return value;
}
function encodedWord(value: string, always = false): string {
  if (!always && /^[\x20-\x7e]*$/.test(value)) return value;
  return "=?UTF-8?B?" + Buffer.from(value, "utf8").toString("base64") + "?=";
}
function messageId(from: string): string {
  const domain = from.slice(from.lastIndexOf("@") + 1);
  return "<" + randomUUID() + "@" + domain + ">";
}
function dotStuff(data: string): string {
  return data.split("\r\n").map(line => line.startsWith(".") ? "." + line : line).join("\r\n");
}
function buildMessage(options: SmtpOptions, message: SmtpMessage): string {
  const from = address(options.from), to = address(message.to);
  const subject = header(message.subject, 300);
  const fromName = options.fromName === undefined ? undefined : header(options.fromName, 100);
  const replyTo = options.replyTo === undefined ? undefined : address(options.replyTo);
  const headers = [
    "From: " + (fromName ? encodedWord(fromName, true) + " " : "") + "<" + from + ">",
    "To: <" + to + ">",
    "Subject: " + encodedWord(subject),
    "Date: " + new Date().toUTCString(),
    "Message-ID: " + messageId(from),
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    ...(replyTo ? ["Reply-To: <" + replyTo + ">"] : [])
  ];
  const body = Buffer.from(message.text, "utf8").toString("base64").match(/.{1,76}/g) ?? [];
  return headers.join("\r\n") + "\r\n\r\n" + body.join("\r\n") + "\r\n";
}
class SmtpSession {
  private buffer = "";
  private current: string[] = [];
  private readonly queued: Response[] = [];
  private pending: {resolve: (response: Response) => void;reject: (error: Error) => void;timer: NodeJS.Timeout} | null = null;
  private closed = false;
  constructor(private readonly socket: Socket, private readonly timeoutMs: number) {
    socket.setEncoding("utf8");
    socket.on("data", (chunk: string) => this.onData(chunk));
    socket.on("error", () => this.fail(new SmtpError("CONNECT")));
    socket.on("close", () => this.fail(new SmtpError("CONNECT")));
  }
  response(): Promise<Response> {
    const queued = this.queued.shift();
    if (queued) return Promise.resolve(queued);
    if (this.closed) return Promise.reject(new SmtpError("CONNECT"));
    if (this.pending) return Promise.reject(new Error("SMTP_PROTOCOL"));
    return new Promise<Response>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.socket.destroy();
        this.fail(new SmtpError("TIMEOUT"));
      }, this.timeoutMs);
      this.pending = {resolve, reject, timer};
    });
  }
  write(line: string): void {
    if (this.closed || !this.socket.writable) throw new SmtpError("CONNECT");
    this.socket.write(line + "\r\n");
  }
  raw(data: string): void {
    if (this.closed || !this.socket.writable) throw new SmtpError("CONNECT");
    this.socket.write(data);
  }
  async command(line: string, expected: readonly number[], stage: SmtpStage): Promise<Response> {
    this.write(line);
    const response = await this.response();
    if (!expected.includes(response.code)) throw new SmtpError(stage, response.code);
    return response;
  }
  async data(message: string, stage: SmtpStage): Promise<void> {
    await this.command("DATA", [354], stage);
    this.raw(dotStuff(message.endsWith("\r\n") ? message : message + "\r\n") + ".\r\n");
    const response = await this.response();
    if (response.code !== 250) throw new SmtpError(stage, response.code);
  }
  quit(): void {
    if (this.closed) return;
    try { this.write("QUIT"); } catch { /* best effort */ }
  }
  close(): void {
    this.closed = true;
    this.socket.destroy();
  }
  private onData(chunk: string): void {
    this.buffer += chunk;
    let index: number;
    while ((index = this.buffer.indexOf("\r\n")) >= 0) {
      const line = this.buffer.slice(0, index);
      this.buffer = this.buffer.slice(index + 2);
      if (!/^\d{3}(?:[ -]|$)/.test(line)) { this.fail(new SmtpError("CONNECT")); return; }
      this.current.push(line);
      const final = line.length === 3 || line[3] === " ";
      if (!final) continue;
      const response: Response = {code: Number(line.slice(0, 3)), lines: this.current};
      this.current = [];
      const pending = this.pending;
      if (!pending) { this.queued.push(response); continue; }
      this.pending = null;
      clearTimeout(pending.timer);
      pending.resolve(response);
    }
  }
  private fail(error: Error): void {
    this.closed = true;
    const pending = this.pending;
    this.pending = null;
    if (pending) { clearTimeout(pending.timer); pending.reject(error); }
  }
}
export class SmtpTransport {
  private readonly timeoutMs: number;
  constructor(private readonly options: SmtpOptions) {
    if (!options.host || !Number.isInteger(options.port) || options.port < 1 || options.port > 65535 ||
      !options.user || !options.password || options.password.length > 512 || /[\u0000-\u001f\u007f]/.test(options.user + options.password)) {
      throw new SmtpError("CONFIG");
    }
    address(options.from);
    if (options.replyTo !== undefined) address(options.replyTo);
    if (options.fromName !== undefined) header(options.fromName, 100);
    if (options.ehloName !== undefined) header(options.ehloName, 255);
    const timeout = options.timeoutMs ?? 15000;
    if (!Number.isInteger(timeout) || timeout < 100 || timeout > 60000) throw new SmtpError("CONFIG");
    this.timeoutMs = timeout;
  }
  private connect(): Promise<Socket> {
    return new Promise<Socket>((resolve, reject) => {
      const socket = this.options.tls === "implicit"
        ? tlsConnect({host: this.options.host, port: this.options.port, servername: this.options.host, rejectUnauthorized: true})
        : netConnect({host: this.options.host, port: this.options.port});
      const timer = setTimeout(() => { socket.destroy(); reject(new SmtpError("CONNECT")); }, this.timeoutMs);
      const ready = (): void => { clearTimeout(timer); resolve(socket); };
      if (this.options.tls === "implicit") socket.once("secureConnect", ready);
      else socket.once("connect", ready);
      socket.once("error", () => { clearTimeout(timer); reject(new SmtpError("CONNECT")); });
    });
  }
  async send(message: SmtpMessage): Promise<void> {
    const wire = buildMessage(this.options, message);
    const socket = await this.connect();
    const session = new SmtpSession(socket, this.timeoutMs);
    try {
      const greeting = await session.response();
      if (greeting.code !== 220) throw new SmtpError("GREETING", greeting.code);
      await session.command("EHLO " + (this.options.ehloName ?? this.options.from.slice(this.options.from.lastIndexOf("@") + 1)), [250], "EHLO");
      await session.command("AUTH LOGIN", [334], "AUTH");
      await session.command(Buffer.from(this.options.user, "utf8").toString("base64"), [334], "AUTH");
      await session.command(Buffer.from(this.options.password, "utf8").toString("base64"), [235], "AUTH");
      await session.command("MAIL FROM:<" + this.options.from + ">", [250], "MAIL");
      await session.command("RCPT TO:<" + message.to + ">", [250, 251], "RCPT");
      await session.data(wire, "DATA");
      session.quit();
    } finally {
      session.close();
    }
  }
}
