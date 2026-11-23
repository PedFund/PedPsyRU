"use strict";
// Browser acceptance for direct registration: possession of the group link,
// an email and the chosen password creates the account immediately. No e-mail
// confirmation code is involved; the code is reserved for password reset.
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
test("registration browser: group link + email + password signs in without a code", {timeout:120000}, async t => {
  const {x, browser} = await scope(t);
  const email = "browser.direct@example.test", password = "synthetic direct registration password";
  const page = await browser.tab("http://127.0.0.1:4174/workspace#join=" + x.invite.invite_token);
  await page.wait("document.getElementById('participant-register-form') && !document.getElementById('participant-signin').disabled");
  assert.equal(await page.evaluate("Boolean(document.getElementById('resume-code'))"), true);
  assert.equal(await page.evaluate("document.getElementById('resume-code').hidden"), true);
  await page.evaluate(`document.getElementById('registration-email').value=${JSON.stringify(email)};document.getElementById('registration-password').value=${JSON.stringify(password)};document.getElementById('contact-approval').checked=true;document.getElementById('participant-register-form').requestSubmit();`);
  await page.wait("document.getElementById('participant-stage-list') && !document.getElementById('participant-signin').disabled");
  assert.equal(await page.evaluate("document.getElementById('confirmation-box').hidden"), true);
  assert.equal(await page.evaluate("document.getElementById('message').textContent.includes('Аккаунт создан')"), true);
  // The new session survives a reload, so the account is usable immediately.
  await page.reload("document.getElementById('participant-stage-list') && !document.getElementById('participant-signin').disabled");
});
