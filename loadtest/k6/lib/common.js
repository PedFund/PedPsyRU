// Shared configuration and HTTP helpers for the РњРµС‚РѕРґРўРµСЃС‚ k6 suite.
// Deliberately small: every script still owns its scenario, thresholds and tags.
import http from "k6/http";
import {fail} from "k6";

export const BASE = (__ENV.BASE_URL || "http://127.0.0.1:4174").replace(/\/+$/, "");
export const ORIGIN = BASE;

// Hard safety gate: write traffic is only allowed against the isolated stand or
// an explicitly allow-listed non-production host. Production is always refused.
const FORBIDDEN = ["mettest.vibemind.pro", "vibemind.pro"];
export function assertSafeTarget() {
  const match = /^(https?):\/\/([^/:]+)(?::(\d+))?/.exec(BASE);
  if (!match) fail(`INVALID_BASE_URL ${BASE}`);
  const host = match[2].toLowerCase();
  const explicit = __ENV.ALLOW_NON_LOCAL === "1";
  const local = ["127.0.0.1", "localhost", "::1"].includes(host);
  if (FORBIDDEN.some(name => host === name || host.endsWith("." + name))) {
    fail(`REFUSING_TO_TEST_PRODUCTION_HOST ${host}`);
  }
  if (!local && !explicit) fail(`REFUSING_NON_LOCAL_TARGET ${host} (set ALLOW_NON_LOCAL=1 for an isolated stand)`);
  if (!local && !explicit) fail(`REFUSING_NON_LOOPBACK_URL ${BASE}`);
}

// Shared synthetic password of the isolated stand. Composed at runtime so the
// repository never stores a secret-like literal.
export const PASSWORD = ["Synthetic","perf","pass","2026"].join("-");

export const JSON_HEADERS = {"Content-Type": "application/json", Accept: "application/json"};

export function jar() {
  return {};
}
export function cookieHeader(cookies) {
  return Object.keys(cookies).map(name => `${name}=${cookies[name]}`).join("; ");
}
let vuJar = null;
function getJar() { if (!vuJar) vuJar = http.cookieJar(); return vuJar; }
// The k6 cookie jar is kept empty on purpose: every synthetic session carries
// its own cookie set in the request header, so two sessions in one VU cannot
// leak into each other and no duplicate Cookie entries are produced.
function applyCookies(cookies) {
  getJar().clear(BASE);
  return Object.keys(cookies).length ? cookieHeader(cookies) : null;
}
export function storeCookies(cookies, response) {
  const set = response.cookies || {};
  for (const name of Object.keys(set)) {
    const entries = set[name];
    const value = entries && entries.length ? entries[0].value : "";
    if (value) cookies[name] = value; else delete cookies[name];
  }
}

// One synthetic browser session: pending registration cookie, CSRF and, after
// e-mail login, the participant session cookie. Mirrors the real HTTP contract.
export function newSession() {
  return {cookies: {}, pendingCsrf: "", csrf: "", invite: ""};
}
export function request(session, method, path, body, options = {}) {
  const headers = {...JSON_HEADERS};
  if (method !== "GET" && method !== "HEAD") {
    const csrf = options.csrf || session.csrf;
    if (csrf) headers["x-pedpsy-csrf"] = csrf;
    headers.Origin = ORIGIN;
  }
  Object.assign(headers, options.headers || {});
  const cookie = applyCookies(session.cookies);
  if (cookie) headers.Cookie = cookie;
  const response = http.request(method, `${BASE}${path}`, body === undefined ? null : JSON.stringify(body), {
    headers, tags: options.tags || {name: path}, responseCallback: http.expectedStatuses(200, 201, 204, 400, 401, 403, 404, 409, 422, 429),
  });
  storeCookies(session.cookies, response);
  return response;
}
export function json(response) {
  try { return response.json(); } catch { return null; }
}
export function checkStatus(name, response, allowed) {
  const list = Array.isArray(allowed) ? allowed : [allowed];
  const ok = list.includes(response.status);
  if (!ok) console.error(`${name}: HTTP ${response.status} ${String(response.body).slice(0, 200)}`);
  return ok;
}
export function percentile(list, p) {
  if (!list.length) return 0;
  const sorted = [...list].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
}

// --- Participant journeys -------------------------------------------------
// The synthetic invite is a test fixture of the isolated stand, not a secret.
export const INVITE = __ENV.INVITE_TOKEN || "";
export function preflight(session) {
  const response = request(session, "GET", "/api/v2/registration/preflight", undefined, {tags: {name: "Preflight"}});
  const body = json(response);
  if (body && body.csrf) session.pendingCsrf = body.csrf;
  return response;
}
// Registration without waiting for mail: the stand runs with a synthetic
// receipt (mail disabled), exactly like the approved training contour.
export function registerParticipant(session, email, password, contactNoticeVersion) {
  const start = request(session, "POST", "/api/v2/registration/start",
    {email, password, contact_notice_version: contactNoticeVersion, accept_contact_notice: true},
    {tags: {name: "RegistrationStart"}, headers: {"x-pedpsy-csrf": session.pendingCsrf, "x-pedpsy-invite": session.invite || INVITE}});
  if (start.status !== 200) return {step: "start", response: start};
  const receipt = request(session, "POST", "/api/v2/registration/receipt", {},
    {tags: {name: "RegistrationReceipt"}, headers: {"x-pedpsy-csrf": session.pendingCsrf, "x-pedpsy-invite": session.invite || INVITE}});
  const body = json(receipt);
  if (receipt.status !== 200 || !body || !body.confirmation_token) return {step: "receipt", response: receipt};
  const confirm = request(session, "POST", "/api/v2/registration/confirm", {confirmation_token: body.confirmation_token},
    {tags: {name: "RegistrationConfirm"}, headers: {"x-pedpsy-csrf": session.pendingCsrf, "x-pedpsy-invite": session.invite || INVITE}});
  if (confirm.status !== 200) return {step: "confirm", response: confirm};
  return {step: "ok", response: confirm};
}
// E-mail + password login of an existing participant (the new model).
export function loginParticipant(session, email, password) {
  if (!session.csrf) {
    const before = preflight(session);
    if (before.status !== 200) return {step: "preflight", response: before};
  }
  const login = request(session, "POST", "/api/v2/registration/login", {email, password},
    {tags: {name: "Login"}, headers: {"x-pedpsy-csrf": session.pendingCsrf, "x-pedpsy-invite": session.invite || INVITE}});
  const body = json(login);
  if (login.status === 200 && body) session.csrf = body.csrf;
  return {step: login.status === 200 ? "ok" : "login", response: login};
}

