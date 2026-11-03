import type {ParticipantContext} from "./participation.js";
export interface LoginSession {token: string; csrf: string; expiresAt: number}
export interface PublicAttempt {id: string; status: "draft" | "completed"; revision: number; current_item_id: string}
export interface ParticipantForm {id: string; version: string; title?:string; instruction?:string; items: {id: string; number: number; text?:string; options: {value: string; text: string}[]}[]}
export interface ParticipantGateway {
  login(input: unknown): Promise<LoginSession>;
  session(token: string): Promise<{context: ParticipantContext; csrf: string; attempts: PublicAttempt[]}>;
  logout(token: string, csrf: string): Promise<void>;
  assertCsrf(token: string, csrf: string): void;
  form(token: string, attemptId: string): Promise<ParticipantForm>;
  denied(token: string, reason: string): Promise<void>;
}
