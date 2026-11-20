"use strict";
// Browser acceptance for the resumable registration: the one-time code survives a
// reload and confirms the same application from another tab, while a replayed code is
// refused. Expiry and wrong-code accounting are covered by the PostgreSQL tests.
const {test} = require("node:test"), assert = require("node:assert/strict"), {randomBytes} = require("node:crypto");
const {postgresFixture} = require("./postgres-fixture.js"), {workspaceFixture} = require("./workspace-fixture.js");
const {chromeFixture} = require("./browser-fixture.js"), {stageSetup} = require("./participant-enrollment-fixture.js");
async function scope(t) {
  const f = await postgresFixture({runtimePoolSize:3}), x = await stageSetup(f);
  const w = workspaceFixture(f, undefined, {contactKey:randomBytes(32), passports:true, consents:true, admissions:true, workbench:true, library:true});
  let browser;
  t.after(async () => {await browser?.close(); await w.app.close(); await f.close();});
  await w.app.listen({host:"127.0.0.1", port:4174});
  browser = await chromeFixture("http://127.0.0.1:4174/health");
  return {f, x, browser};
}
test("registration browser: reload and a second tab confirm the code once, a replay is refused", {timeout:120000}, async t => {
  const {x, browser} = await scope(t);
  const email = "browser.resend@example.test", password = "synthetic browser resend password";
  const page = await browser.tab("http://127.0.0.1:4174/workspace#join=" + x.invite.invite_token);
  await page.wait("document.getElementById('participant-register-form') && !document.getElementById('participant-signin').disabled");
  await page.evaluate(`document.getElementById('registration-email').value=${JSON.stringify(email)};document.getElementById('contact-approval').checked=true;document.getElementById('participant-register-form').requestSubmit();`);
  await page.wait("!document.getElementById('confirmation-box').hidden");
  await page.evaluate("document.getElementById('show-receipt').click()");
  await page.wait("!document.getElementById('confirm-contact').hidden");
  const code = await page.evaluate("document.getElementById('receipt-token').textContent");
  assert.match(code, /^[A-Za-z0-9_-]{20,80}$/);
  // A reload must not lose the application: the code entry stays reachable.
  await page.reload("document.getElementById('participant-screen') && !document.getElementById('participant-screen').hidden");
  const afterReload = await page.evaluate("JSON.stringify({message:document.getElementById('message').textContent,resume:Boolean(document.getElementById('resume-code')),hint:Boolean(document.getElementById('entry-register-hint')),hintHidden:document.getElementById('entry-register-hint')?.hidden,hash:location.hash})");
  assert.match(afterReload, /"resume":true/, "the reloaded page keeps the code entry: " + afterReload);
  // Another tab (a phone in real life) confirms the same application with the code.
  const second = await browser.tab("http://127.0.0.1:4174/workspace#join=" + x.invite.invite_token);
  await second.wait("document.getElementById('resume-code')");
  await second.evaluate(`document.getElementById('resume-code').open=true;document.getElementById('resume-code-value').value=${JSON.stringify(code)};document.getElementById('resume-code-confirm').click()`);
  await second.wait("document.getElementById('new-password') && !document.getElementById('save-password').disabled");
  await second.evaluate(`document.getElementById('new-password').value=${JSON.stringify(password)};document.getElementById('save-password').click()`);
  await second.wait("document.getElementById('message').textContent.includes('Пароль сохранён')");
  // The reloaded tab replays the same code and is refused.
  await page.evaluate(`document.getElementById('resume-code').open=true;document.getElementById('resume-code-value').value=${JSON.stringify(code)};document.getElementById('resume-code-confirm').click()`);
  await page.wait("document.getElementById('message').textContent.includes('Доступ недоступен')");
});
